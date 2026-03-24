import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'
import '../components/channel-form'

interface ChannelAccount {
  accountId: string
  enabled?: boolean
  configured?: boolean
  connected?: boolean
  running?: boolean
  lastError?: string
  lastInboundAt?: number
  lastOutboundAt?: number
}

interface ChannelMeta {
  id: string
  label: string
  detailLabel: string
  systemImage?: string
}

interface ChannelsStatusResult {
  channelOrder?: string[]
  channelLabels?: Record<string, string>
  channelMeta?: ChannelMeta[]
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

type ViewMode = 'list' | 'configure'

const HIDDEN_CHANNELS = new Set(['whatsapp', 'signal', 'imessage'])

@customElement('ocbot-channels-view')
export class OcbotChannelsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() private viewMode: ViewMode = 'list'
  @state() private loading = true
  @state() private error: string | null = null
  @state() private status: ChannelsStatusResult = {}
  @state() private schemas: ChannelSchemaEntry[] = []
  @state() private configureChannelId: string | null = null
  @state() private channelConfig: Record<string, unknown> | null = null
  @state() private channelConfigHash: string | null = null

  private refreshTimer: ReturnType<typeof setInterval> | null = null

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
  }

  private async loadData() {
    this.loading = true
    this.error = null
    try {
      const [statusResult, schemaResult] = await Promise.all([
        this.gateway.call<ChannelsStatusResult>('channels.status'),
        this.gateway.call<ConfigSchemaResult>('config.schema'),
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
      // silent refresh failure
    }
  }

  private async enterConfigure(channelId: string) {
    this.configureChannelId = channelId
    this.channelConfig = null
    this.channelConfigHash = null
    this.viewMode = 'configure'
    try {
      const result = await this.gateway.call<{ config?: Record<string, unknown>; hash?: string }>('config.get')
      const config = result?.config ?? {}
      const channels = (config as Record<string, unknown>).channels as Record<string, unknown> | undefined
      this.channelConfig = (channels?.[channelId] as Record<string, unknown>) ?? {}
      this.channelConfigHash = result?.hash ?? null
    } catch {
      this.channelConfig = {}
    }
  }

  private backToList() {
    this.viewMode = 'list'
    this.configureChannelId = null
    this.channelConfig = null
    this.channelConfigHash = null
    this.loadStatus()
  }

  private getOrderedChannelIds(): string[] {
    const order = this.status.channelOrder ?? []
    const channelKeys = Object.keys(this.status.channels ?? {})
    const metaIds = (this.status.channelMeta ?? []).map(m => m.id)
    const allIds = new Set([...order, ...channelKeys, ...metaIds])
    // Maintain order: use channelOrder first, then remaining
    const result: string[] = []
    for (const id of order) {
      if (allIds.has(id) && !HIDDEN_CHANNELS.has(id)) result.push(id)
    }
    for (const id of allIds) {
      if (!result.includes(id) && !HIDDEN_CHANNELS.has(id)) result.push(id)
    }
    return result
  }

  private getChannelLabel(id: string): string {
    const meta = (this.status.channelMeta ?? []).find(m => m.id === id)
    if (meta?.label) return meta.label
    if (this.status.channelLabels?.[id]) return this.status.channelLabels[id]
    return id.charAt(0).toUpperCase() + id.slice(1)
  }

  private getChannelBadge(id: string): string {
    const meta = (this.status.channelMeta ?? []).find(m => m.id === id)
    return meta?.detailLabel ?? ''
  }

  private getAccountSummary(id: string): { connected: number; total: number; lastActivity: number; lastError: string | null } {
    const accounts = this.status.channelAccounts?.[id] ?? []
    let connected = 0
    let lastActivity = 0
    let lastError: string | null = null
    for (const acc of accounts) {
      if (acc.connected || acc.running) connected++
      const ts = Math.max(acc.lastInboundAt ?? 0, acc.lastOutboundAt ?? 0)
      if (ts > lastActivity) lastActivity = ts
      if (acc.lastError && !lastError) lastError = acc.lastError
    }
    return { connected, total: accounts.length, lastActivity, lastError }
  }

  private isConfigured(id: string): boolean {
    return this.status.channels?.[id]?.configured === true
  }

  private getTimeAgo(ts: number): string {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60_000) return 'just now'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
    return `${Math.floor(diff / 86400_000)}d ago`
  }

  private getChannelIcon(channelId: string): string {
    const iconMap: Record<string, string> = {
      telegram: 'send',
      discord: 'chat',
      slack: 'sessions',
      irc: 'monitor',
      googlechat: 'mail',
      line: 'chat',
    }
    return iconMap[channelId] ?? 'channels'
  }

  private getStatusColor(id: string): string {
    const summary = this.getAccountSummary(id)
    if (summary.connected > 0) return 'var(--ok)'
    if (this.isConfigured(id)) return 'var(--warn)'
    return 'var(--muted)'
  }

  private getSchema(id: string): ChannelSchemaEntry | undefined {
    return this.schemas.find(s => s.id === id)
  }

  override render() {
    if (this.viewMode === 'configure' && this.configureChannelId) {
      return this.renderConfigure()
    }
    return this.renderList()
  }

  private renderList() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; margin-bottom:20px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Channels</h2>
        </div>

        ${this.loading ? html`
          <div class="settings__empty">Loading...</div>
        ` : this.error ? html`
          <div style="text-align:center; color:var(--danger); padding:40px;">${this.error}</div>
        ` : this.renderChannelList()}
      </div>
    `
  }

  private renderChannelList() {
    const ids = this.getOrderedChannelIds()
    if (ids.length === 0) {
      return html`
        <div class="settings__empty">No channels available</div>
      `
    }

    const anyConfigured = ids.some(id => this.isConfigured(id))

    return html`
      ${!anyConfigured ? html`
        <p class="channels__intro">Connect your agent to messaging platforms. Choose one below to get started.</p>
      ` : nothing}
      <div class="channels__list">
        ${ids.map(id => this.renderChannelCard(id))}
      </div>
    `
  }

  private renderChannelCard(id: string) {
    const label = this.getChannelLabel(id)
    const badge = this.getChannelBadge(id)
    const configured = this.isConfigured(id)
    const summary = this.getAccountSummary(id)
    const statusColor = this.getStatusColor(id)

    return html`
      <div class="channels__card ${configured ? 'channels__card--configured' : ''}">
        <div class="channels__card-header">
          <div class="channels__card-info">
            <span class="channels__card-icon">${svgIcon(this.getChannelIcon(id), 16)}</span>
            <span class="channels__status-dot" style="background:${statusColor};"></span>
            <span class="channels__card-name">${label}</span>
            ${badge ? html`<span class="channels__card-badge">${badge}</span>` : nothing}
          </div>
          <button class="channels__configure-btn" @click=${() => this.enterConfigure(id)}>
            ${configured ? html`${svgIcon('config', 14)} Configure` : html`${svgIcon('plus', 14)} Set up`}
          </button>
        </div>
        ${summary.lastActivity ? html`
          <div class="channels__card-activity">Last activity: ${this.getTimeAgo(summary.lastActivity)}</div>
        ` : nothing}
        ${summary.lastError ? html`
          <div class="channels__card-error">${summary.lastError}</div>
        ` : nothing}
      </div>
    `
  }

  private renderConfigure() {
    const id = this.configureChannelId!
    const label = this.getChannelLabel(id)
    const schema = this.getSchema(id)

    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div class="settings__page">
          <button class="settings__back-btn" @click=${() => this.backToList()}>
            &larr; Back to Channels
          </button>
          <h2 class="settings__page-title">${label}</h2>
          <p class="settings__page-subtitle">Configure your ${label} channel connection.</p>
          <div class="settings__form-container">
            ${this.channelConfig === null ? html`
              <div class="settings__empty">Loading configuration...</div>
            ` : html`
              <ocbot-channel-form
                .gateway=${this.gateway}
                .channelId=${id}
                .channelConfig=${this.channelConfig}
                .configHash=${this.channelConfigHash}
                .configSchema=${schema?.configSchema ?? null}
                .configUiHints=${schema?.configUiHints ?? null}
                @channel-saved=${() => this.backToList()}
              ></ocbot-channel-form>
            `}
          </div>
        </div>
      </div>
    `
  }
}
