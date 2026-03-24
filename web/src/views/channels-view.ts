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

type ViewMode = 'list' | 'configure'

// Static channel catalog — always shown regardless of plugin load state.
// When a channel plugin is loaded, live status from channels.status is merged in.
interface ChannelHint {
  id: string
  label: string
  detailLabel: string
  icon: string
  description: string
}

const CHANNEL_CATALOG: ChannelHint[] = [
  { id: 'telegram', label: 'Telegram', detailLabel: 'Telegram Bot', icon: 'send', description: 'Simplest way to get started — register a bot with @BotFather and get going.' },
  { id: 'whatsapp', label: 'WhatsApp', detailLabel: 'WhatsApp Web', icon: 'chat', description: 'Works with your own number; recommend a separate phone + eSIM.' },
  { id: 'discord', label: 'Discord', detailLabel: 'Discord Bot', icon: 'chat', description: 'Very well supported — create a bot in the Developer Portal.' },
  { id: 'irc', label: 'IRC', detailLabel: 'IRC', icon: 'monitor', description: 'Classic IRC networks with DM/channel routing and pairing controls.' },
  { id: 'googlechat', label: 'Google Chat', detailLabel: 'Google Chat', icon: 'mail', description: 'Google Workspace Chat app with HTTP webhook.' },
  { id: 'slack', label: 'Slack', detailLabel: 'Slack Bot', icon: 'sessions', description: 'Supported via Socket Mode.' },
  { id: 'signal', label: 'Signal', detailLabel: 'Signal REST', icon: 'channels', description: 'signal-cli linked device.' },
  { id: 'imessage', label: 'iMessage', detailLabel: 'iMessage', icon: 'chat', description: 'macOS — requires imsg CLI.' },
  { id: 'line', label: 'LINE', detailLabel: 'LINE Bot', icon: 'chat', description: 'LINE Messaging API webhook bot.' },
]

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
      // Load live status + schemas in parallel; both may return empty if no plugins loaded yet
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
    // Always use static catalog as the base list
    return CHANNEL_CATALOG.map(ch => ch.id)
  }

  private getChannelHint(id: string): ChannelHint | undefined {
    return CHANNEL_CATALOG.find(ch => ch.id === id)
  }

  private getChannelLabel(id: string): string {
    // Prefer live data from gateway, fall back to static catalog
    const meta = (this.status.channelMeta ?? []).find(m => m.id === id)
    if (meta?.label) return meta.label
    return this.getChannelHint(id)?.label ?? id
  }

  private getChannelBadge(id: string): string {
    const meta = (this.status.channelMeta ?? []).find(m => m.id === id)
    if (meta?.detailLabel) return meta.detailLabel
    return this.getChannelHint(id)?.detailLabel ?? ''
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
    return this.getChannelHint(channelId)?.icon ?? 'channels'
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
    const hint = this.getChannelHint(id)
    const schema = this.getSchema(id)

    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div class="settings__page">
          <button class="settings__back-btn" @click=${() => this.backToList()}>
            &larr; Back to Channels
          </button>
          <h2 class="settings__page-title">${label}</h2>
          <p class="settings__page-subtitle">${hint?.description ?? `Configure your ${label} channel connection.`}</p>
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
