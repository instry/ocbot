import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { CHANNEL_CATALOG as _GENERATED_CATALOG, type ChannelCatalogEntry } from '../generated/channel-catalog'
import '../components/channel-form'

// Extra channels not yet in openclaw — shown as "Coming Soon" in the UI
const EXTRA_CHANNELS: ChannelCatalogEntry[] = [
  { id: 'wechat', label: 'WeChat', detailLabel: 'WeChat', blurb: 'WeChat Official Account and personal messaging integration.', order: 36 },
  { id: 'qq', label: 'QQ', detailLabel: 'QQ', blurb: 'QQ bot messaging integration.', order: 37 },
]

const CHANNEL_CATALOG: ChannelCatalogEntry[] = [
  ..._GENERATED_CATALOG,
  ...EXTRA_CHANNELS.filter(e => !_GENERATED_CATALOG.some(g => g.id === e.id)),
].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
import '../components/channel-credentials'
import '../components/channel-status'

interface ChannelAccount {
  accountId: string
  name?: string
  enabled?: boolean
  configured?: boolean
  connected?: boolean
  running?: boolean
  lastError?: string
  lastInboundAt?: number
  lastOutboundAt?: number
}

interface PairingRequest {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

interface ChannelsStatusResult {
  channelOrder?: string[]
  channelLabels?: Record<string, string>
  channelMeta?: Array<{ id: string; label: string; detailLabel: string }>
  channels?: Record<string, { configured?: boolean }>
  channelAccounts?: Record<string, ChannelAccount[]>
}

interface ChannelSchemaEntry {
  id: string
  label: string
  description?: string
  configSchema?: Record<string, unknown>
  configUiHints?: Record<string, unknown>
}

interface ConfigSchemaResult {
  channels?: ChannelSchemaEntry[]
}

type ChannelPhase = 'credentials' | 'connecting' | 'connected'

const MAX_UNCONFIGURED_VISIBLE = 10

@customElement('ocbot-channels-view')
export class OcbotChannelsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property({ attribute: false }) initialChannelId: string | null = null

  @state() private loading = true
  @state() private error: string | null = null
  @state() private status: ChannelsStatusResult = {}
  @state() private schemas: ChannelSchemaEntry[] = []
  @state() private selectedChannelId: string | null = null
  @state() private channelConfig: Record<string, unknown> | null = null
  @state() private channelConfigHash: string | null = null
  @state() private showAllUnconfigured = false
  @state() private pairingRequests: PairingRequest[] = []
  @state() private pairingError: string | null = null
  @state() private approving = new Set<string>()
  @state() private savingCredentials = false
  @state() private editingCredentials = false

  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private pairingTimer: ReturnType<typeof setInterval> | null = null
  private initialChannelHandled = false

  override connectedCallback() {
    super.connectedCallback()
    this.loadData()
    this.refreshTimer = setInterval(() => this.loadStatus(), 30_000)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
    this.stopPairingPoll()
  }

  override updated(changed: Map<string, unknown>) {
    if (!this.initialChannelHandled && !this.loading && this.initialChannelId) {
      this.initialChannelHandled = true
      this.selectChannel(this.initialChannelId)
    }
    if (changed.has('initialChannelId') && this.initialChannelId && !this.loading) {
      this.selectChannel(this.initialChannelId)
    }
  }

  private async loadData() {
    this.loading = true
    this.error = null
    try {
      const [statusResult, schemaResult] = await Promise.all([
        this.gateway.call<ChannelsStatusResult>('channels.status').catch((): ChannelsStatusResult => ({})),
        this.gateway.call<ConfigSchemaResult>('config.schema').catch((): ConfigSchemaResult => ({})),
      ])
      this.status = statusResult ?? {}
      this.schemas = schemaResult?.channels ?? []
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private async loadStatus() {
    try {
      const result = await this.gateway.call<ChannelsStatusResult>('channels.status')
      this.status = result ?? {}
    } catch {
      // silent
    }
  }

  private async selectChannel(channelId: string) {
    this.selectedChannelId = channelId
    this.channelConfig = null
    this.channelConfigHash = null
    this.editingCredentials = false
    this.dispatchEvent(new CustomEvent('channel-navigated', { detail: channelId }))
    if (this.isConfigured(channelId)) {
      try {
        const result = await this.gateway.call<{ config?: Record<string, unknown>; hash?: string }>('config.get')
        const config = result?.config ?? {}
        const channels = (config as Record<string, unknown>).channels as Record<string, unknown> | undefined
        this.channelConfig = (channels?.[channelId] as Record<string, unknown>) ?? {}
        this.channelConfigHash = result?.hash ?? null
      } catch {
        this.channelConfig = {}
      }
      this.startPairingPoll(channelId)
    } else {
      this.stopPairingPoll()
    }
  }

  private deselectChannel() {
    this.selectedChannelId = null
    this.channelConfig = null
    this.channelConfigHash = null
    this.stopPairingPoll()
    this.dispatchEvent(new CustomEvent('channel-navigated', { detail: null }))
    this.loadStatus()
  }

  private startEditingCredentials() {
    this.editingCredentials = true
  }

  private stopEditingCredentials() {
    this.editingCredentials = false
  }

  // ── Phase detection ──

  private getChannelPhase(id: string): ChannelPhase {
    if (this.editingCredentials) return 'credentials'
    if (!this.isConfigured(id)) return 'credentials'
    if (this.channelIsConnected(id)) return 'connected'
    return 'connecting'
  }

  // ── Credentials save ──

  private async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  private markChannelConfigured(channelId: string) {
    this.status = {
      ...this.status,
      channels: {
        ...(this.status.channels ?? {}),
        [channelId]: {
          ...(this.status.channels?.[channelId] ?? {}),
          configured: true,
        },
      },
    }
  }

  private async refreshAfterCredentialSave(channelId: string, previousHash: string) {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      try {
        const [statusResult, configResult] = await Promise.all([
          this.gateway.call<ChannelsStatusResult>('channels.status'),
          this.gateway.call<{ hash?: string }>('config.get'),
        ])
        const configured = statusResult?.channels?.[channelId]?.configured === true
        const hashChanged = Boolean(configResult?.hash && configResult.hash !== previousHash)
        if (configured || hashChanged) {
          this.status = statusResult ?? this.status
          break
        }
      } catch {
        // gateway restart window
      }
      await this.wait(800)
    }

    try {
      await this.loadData()
      if (this.selectedChannelId === channelId) {
        await this.selectChannel(channelId)
      }
    } catch {
      // keep optimistic UI state
    }
  }

  private async onCredentialsReady(e: CustomEvent) {
    const { channelId, config } = e.detail as { channelId: string; config: Record<string, unknown> }
    this.savingCredentials = true
    const credentialsEl = this.querySelector('ocbot-channel-credentials') as
      import('../components/channel-credentials').OcbotChannelCredentials | null

    try {
      const freshConfig = await this.gateway.call<{ hash?: string }>('config.get')
      const baseHash = freshConfig?.hash ?? ''
      const patch = { channels: { [channelId]: config } }
      await this.gateway.call('config.patch', { baseHash, raw: JSON.stringify(patch) })
      this.markChannelConfigured(channelId)
      this.channelConfig = { ...config }
      this.editingCredentials = false
      credentialsEl?.setSaveResult({ ok: true })
      await this.selectChannel(channelId)
      await this.refreshAfterCredentialSave(channelId, baseHash)
    } catch (err) {
      credentialsEl?.setSaveResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.savingCredentials = false
    }
  }

  // ── Status change from channel-status component ──

  private async onStatusChanged(id: string, e: CustomEvent) {
    const { status } = e.detail as { status: string }
    if (status === 'connected') {
      // Reload schema (plugin is now fully loaded) and config
      await this.loadData()
      if (this.selectedChannelId === id) {
        this.selectChannel(id)
      }
    }
  }

  // ── Channel saved (advanced settings) ──

  private async onChannelSaved(channelId: string) {
    await this.loadStatus()
    this.selectChannel(channelId)
  }

  // ── Pairing ──

  private startPairingPoll(channelId: string) {
    this.stopPairingPoll()
    this.loadPairingRequests(channelId)
    this.pairingTimer = setInterval(() => this.loadPairingRequests(channelId), 10_000)
  }

  private stopPairingPoll() {
    if (this.pairingTimer) {
      clearInterval(this.pairingTimer)
      this.pairingTimer = null
    }
    this.pairingRequests = []
    this.pairingError = null
  }

  private async loadPairingRequests(channelId: string) {
    try {
      const result = await this.gateway.call<{
        channel: string
        requests: PairingRequest[]
      }>('channel.pairing.list', { channel: channelId })
      this.pairingRequests = result?.requests ?? []
      this.pairingError = null
    } catch {
      this.pairingRequests = []
    }
  }

  private async approvePairing(channelId: string, code: string) {
    const key = `${channelId}:${code}`
    this.approving = new Set([...this.approving, key])
    this.requestUpdate()
    try {
      await this.gateway.call('channel.pairing.approve', { channel: channelId, code })
      await this.loadPairingRequests(channelId)
    } catch (err) {
      this.pairingError = err instanceof Error ? err.message : String(err)
    } finally {
      this.approving.delete(key)
      this.approving = new Set(this.approving)
      this.requestUpdate()
    }
  }

  private timeAgo(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    return `${hours}h ago`
  }

  // ── Helpers ──

  private getConfiguredIds(): string[] {
    const channels = this.status.channels ?? {}
    return CHANNEL_CATALOG
      .filter(ch => channels[ch.id]?.configured)
      .map(ch => ch.id)
  }

  private getUnconfiguredIds(): string[] {
    const channels = this.status.channels ?? {}
    const ids = CHANNEL_CATALOG
      .filter(ch => !channels[ch.id]?.configured)
      .map(ch => ch.id)
    // Pin feishu to top of unconfigured list
    const feishuIdx = ids.indexOf('feishu')
    if (feishuIdx > 0) {
      ids.splice(feishuIdx, 1)
      ids.unshift('feishu')
    }
    return ids
  }

  private getChannelHint(id: string): ChannelCatalogEntry | undefined {
    return CHANNEL_CATALOG.find(ch => ch.id === id)
  }

  private getChannelLabel(id: string): string {
    const meta = (this.status.channelMeta ?? []).find(m => m.id === id)
    if (meta?.label) return meta.label
    return this.getChannelHint(id)?.label ?? id
  }

  private isConfigured(id: string): boolean {
    return this.status.channels?.[id]?.configured === true
  }

  private channelIsConnected(id: string): boolean {
    const accounts = this.status.channelAccounts?.[id] ?? []
    return accounts.some(a => a.connected || a.running)
  }

  private getStatusColor(id: string): string {
    if (this.channelIsConnected(id)) return 'var(--ok)'
    if (this.isConfigured(id)) return 'var(--warn)'
    return 'var(--muted)'
  }

  private getSchema(id: string): ChannelSchemaEntry | undefined {
    return this.schemas.find(s => s.id === id)
  }

  // ── Render ──

  override render() {
    return html`
      <div class="settings">
        ${this.renderSubNav()}
        <div class="settings__content">
          ${this.selectedChannelId
            ? this.renderConfigureContent()
            : this.renderWelcome()}
        </div>
      </div>
    `
  }

  private renderSubNav() {
    const configuredIds = this.getConfiguredIds()
    const unconfiguredIds = this.getUnconfiguredIds()
    const visibleUnconfigured = this.showAllUnconfigured
      ? unconfiguredIds
      : unconfiguredIds.slice(0, MAX_UNCONFIGURED_VISIBLE)
    const hiddenCount = unconfiguredIds.length - MAX_UNCONFIGURED_VISIBLE

    return html`
      <div class="sub-nav">
        <div class="sub-nav__header">Channels</div>
        <nav class="sub-nav__items" style="overflow-y:auto; flex:1;">
          ${configuredIds.length > 0 ? html`
            ${configuredIds.map(id => this.renderNavItem(id))}
            <div style="border-top:1px solid var(--border); margin:6px 0;"></div>
          ` : nothing}
          ${visibleUnconfigured.map(id => this.renderNavItem(id))}
          ${!this.showAllUnconfigured && hiddenCount > 0 ? html`
            <button
              class="sub-nav__btn"
              style="color:var(--muted); font-size:12px;"
              @click=${() => { this.showAllUnconfigured = true }}
            >Show ${hiddenCount} more...</button>
          ` : nothing}
        </nav>
      </div>
    `
  }

  private renderNavItem(id: string) {
    const active = this.selectedChannelId === id
    return html`
      <button
        class="sub-nav__btn ${active ? 'sub-nav__btn--active' : ''}"
        @click=${() => this.selectChannel(id)}
      >
        <span class="sub-nav__dot" style="background:${this.getStatusColor(id)}"></span>
        <span>${this.getChannelLabel(id)}</span>
      </button>
    `
  }

  private renderWelcome() {
    return html`
      <div style="display:flex; align-items:center; justify-content:center; height:100%; padding:24px;">
        <div style="text-align:center; max-width:360px;">
          <div style="font-size:18px; font-weight:600; color:var(--text-strong); margin-bottom:8px;">Channels</div>
          <p style="font-size:14px; color:var(--muted); line-height:1.6; margin:0;">
            Connect your agent to messaging platforms. Select a channel from the left to get started.
          </p>
        </div>
      </div>
    `
  }

  private isComingSoon(id: string): boolean {
    return id !== 'feishu' && !this.isConfigured(id)
  }

  private renderConfigureContent() {
    const id = this.selectedChannelId!
    const label = this.getChannelLabel(id)
    const hint = this.getChannelHint(id)

    if (this.isComingSoon(id)) {
      return html`
        <div style="display:flex; align-items:center; justify-content:center; height:100%; padding:24px;">
          <div style="text-align:center; max-width:360px;">
            <div style="font-size:18px; font-weight:600; color:var(--text-strong); margin-bottom:8px;">${label}</div>
            <p style="font-size:14px; color:var(--muted); line-height:1.6; margin:0 0 6px 0;">
              ${hint?.blurb ?? ''}
            </p>
            <span style="
              display:inline-block; margin-top:12px; padding:4px 14px;
              border-radius:999px; font-size:13px; font-weight:500;
              background:var(--warn-subtle, rgba(214,158,46,0.1));
              color:var(--warn, #d69e2e);
            ">Coming Soon</span>
          </div>
        </div>
      `
    }

    const phase = this.getChannelPhase(id)
    const schema = this.getSchema(id)

    return html`
      <div style="padding:20px; overflow-y:auto;">
        <div class="settings__page">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:8px;">
            <div style="min-width:0;">
              <h2 class="settings__page-title" style="margin-bottom:8px;">${label}</h2>
              <p class="settings__page-subtitle" style="margin:0;">${hint?.blurb ?? `Configure your ${label} channel connection.`}</p>
            </div>
            ${this.isConfigured(id) ? html`
              <button
                class="btn btn--sm"
                style="flex-shrink:0; padding:6px 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel); color:var(--text-strong); cursor:pointer;"
                @click=${() => phase === 'credentials' ? this.stopEditingCredentials() : this.startEditingCredentials()}
              >${phase === 'credentials' ? 'Back to Status' : 'Edit Credentials'}</button>
            ` : nothing}
          </div>

          ${phase === 'credentials' ? html`
            <div class="settings__form-container">
              <ocbot-channel-credentials
                .channelId=${id}
                .initialConfig=${this.channelConfig}
                @credentials-ready=${(e: CustomEvent) => this.onCredentialsReady(e)}
              ></ocbot-channel-credentials>
            </div>
          ` : nothing}

          ${phase === 'connecting' ? html`
            <ocbot-channel-status
              .gateway=${this.gateway}
              .channelId=${id}
              @status-changed=${(e: CustomEvent) => this.onStatusChanged(id, e)}
            ></ocbot-channel-status>
          ` : nothing}

          ${phase === 'connected' ? html`
            <ocbot-channel-status
              .gateway=${this.gateway}
              .channelId=${id}
              @status-changed=${(e: CustomEvent) => this.onStatusChanged(id, e)}
            ></ocbot-channel-status>
            ${schema?.configSchema ? html`
              <div class="settings__form-container" style="margin-top:20px;">
                ${this.channelConfig === null ? html`
                  <div class="settings__empty">Loading configuration...</div>
                ` : html`
                  <ocbot-channel-form
                    .gateway=${this.gateway}
                    .channelId=${id}
                    .channelConfig=${this.channelConfig}
                    .configHash=${this.channelConfigHash}
                    .configSchema=${schema.configSchema ?? null}
                    .configUiHints=${schema.configUiHints ?? null}
                    @channel-saved=${() => { this.onChannelSaved(id) }}
                  ></ocbot-channel-form>
                `}
              </div>
            ` : nothing}
            ${this.renderPairingSection(id)}
          ` : nothing}
        </div>
      </div>
    `
  }

  private renderPairingSection(channelId: string) {
    if (this.pairingRequests.length === 0 && !this.pairingError) return nothing

    return html`
      <div style="margin-top:28px; border-top:1px solid var(--border); padding-top:20px;">
        <h3 style="font-size:15px; font-weight:600; color:var(--text-strong); margin:0 0 4px 0;">Pairing Requests</h3>
        <p style="font-size:13px; color:var(--muted); margin:0 0 12px 0;">
          Users waiting for approval to message your bot.
        </p>
        ${this.pairingError ? html`
          <div style="color:var(--danger); margin-bottom:8px; font-size:13px;">${this.pairingError}</div>
        ` : nothing}
        ${this.pairingRequests.map(req => {
          const key = `${channelId}:${req.code}`
          const isApproving = this.approving.has(key)
          return html`
            <div class="session-card" style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:13px; font-weight:500; color:var(--text-strong);">${req.id}</span>
                  <code style="font-size:11px; padding:1px 6px; border-radius:3px; background:var(--surface); color:var(--muted);">${req.code}</code>
                </div>
                <div style="font-size:12px; color:var(--muted); margin-top:2px;">
                  Requested ${this.timeAgo(req.createdAt)}
                </div>
              </div>
              <button
                class="btn btn--sm btn--primary"
                style="flex-shrink:0; padding:4px 14px; font-size:12px; border-radius:6px; cursor:pointer; background:var(--accent); color:#fff; border:none;"
                ?disabled=${isApproving}
                @click=${() => this.approvePairing(channelId, req.code)}
              >${isApproving ? 'Approving...' : 'Approve'}</button>
            </div>
          `
        })}
      </div>
    `
  }
}
