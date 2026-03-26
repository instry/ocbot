import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

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
  dmPolicy?: string
  mode?: string
  application?: { name?: string; open_id?: string }
  [key: string]: unknown
}

interface ChannelsStatusResult {
  channelAccounts?: Record<string, ChannelAccount[]>
  channels?: Record<string, { configured?: boolean }>
}

export type ChannelConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected'

@customElement('ocbot-channel-status')
export class OcbotChannelStatus extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property({ type: String }) channelId = ''

  @state() private status: ChannelConnectionStatus = 'connecting'
  @state() private botName: string | null = null
  @state() private lastError: string | null = null
  @state() private accountInfo: ChannelAccount | null = null

  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pollCount = 0
  private prevChannelId = ''

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('channelId') && this.channelId !== this.prevChannelId) {
      this.prevChannelId = this.channelId
      this.stopPolling()
      this.startPolling()
    }
  }

  override connectedCallback() {
    super.connectedCallback()
    this.startPolling()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.stopPolling()
  }

  private startPolling() {
    this.pollCount = 0
    this.status = 'connecting'
    this.botName = null
    this.lastError = null
    this.accountInfo = null
    this.poll()
    // Poll fast initially (2s), slow down after 10 polls (10s)
    this.pollTimer = setInterval(() => this.poll(), 2000)
  }

  private stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
  }

  private async poll() {
    this.pollCount++
    if (this.pollCount === 10 && this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = setInterval(() => this.poll(), 10000)
    }

    try {
      const result = await this.gateway.call<ChannelsStatusResult>('channels.status')
      const accounts = result?.channelAccounts?.[this.channelId] ?? []
      const account = accounts[0] ?? null
      const connected = accounts.some(a => a.connected || a.running)
      const error = accounts.find(a => a.lastError)?.lastError ?? null

      // Prefer application name (from probe) > account name > appId
      const appName = (account?.application as Record<string, unknown>)?.name as string | undefined
      const name = appName || account?.name || (account as Record<string, unknown>)?.appId as string | undefined || null

      const prevStatus = this.status

      if (connected) {
        this.status = 'connected'
        this.botName = name
        this.accountInfo = account
        this.lastError = null
        this.stopPolling()
        // Keep a slow background poll to detect disconnections
        this.pollTimer = setInterval(() => this.poll(), 30000)
      } else if (error) {
        this.status = 'error'
        this.lastError = error
        this.botName = null
      } else {
        // No accounts yet (gateway still restarting)
        this.status = 'connecting'
      }

      if (prevStatus !== this.status) {
        this.dispatchEvent(new CustomEvent('status-changed', {
          bubbles: true, composed: true,
          detail: { status: this.status, botName: this.botName, lastError: this.lastError },
        }))
      }
    } catch {
      // Gateway might be restarting, keep polling
    }
  }

  override render() {
    return html`
      <div class="channel-status">
        ${this.status === 'connecting' ? html`
          <div class="channel-status__row">
            <span class="channel-status__dot channel-status__dot--connecting"></span>
            <span class="channel-status__text">Connecting...</span>
          </div>
        ` : nothing}

        ${this.status === 'connected' ? html`
          <div class="channel-status__row">
            <span class="channel-status__dot channel-status__dot--connected"></span>
            <span class="channel-status__text">
              Connected${this.botName ? html` — <strong>${this.botName}</strong>` : nothing}
            </span>
          </div>
          ${this.renderAccountDetails()}
          ${this.renderPairingHint()}
        ` : nothing}

        ${this.status === 'error' ? html`
          <div class="channel-status__row">
            <span class="channel-status__dot channel-status__dot--error"></span>
            <span class="channel-status__text">Connection failed</span>
          </div>
          ${this.lastError ? html`
            <div class="channel-status__error">${this.lastError}</div>
          ` : nothing}
        ` : nothing}

        ${this.status === 'disconnected' ? html`
          <div class="channel-status__row">
            <span class="channel-status__dot channel-status__dot--disconnected"></span>
            <span class="channel-status__text">Disconnected</span>
          </div>
        ` : nothing}
      </div>
    `
  }

  private renderAccountDetails() {
    if (!this.accountInfo) return nothing
    const info = this.accountInfo as Record<string, unknown>
    const domain = info.domain as string | undefined
    const mode = info.mode as string | undefined
    const appId = info.appId as string | undefined

    const details: string[] = []
    if (appId) details.push(appId)
    if (domain) details.push(domain === 'lark' ? 'Lark' : 'Feishu')
    if (mode) details.push(mode)

    if (details.length === 0) return nothing

    return html`
      <div class="channel-status__details">${details.join(' · ')}</div>
    `
  }

  private renderPairingHint() {
    if (!this.accountInfo) return nothing
    const dmPolicy = (this.accountInfo as Record<string, unknown>).dmPolicy as string | undefined
    if (dmPolicy !== 'pairing') return nothing

    return html`
      <div class="channel-status__hint">
        DM access requires pairing. Users need to send a message to your bot
        and you approve them in the Pairing Requests section below.
      </div>
    `
  }
}
