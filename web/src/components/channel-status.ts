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
      const connected = accounts.some(a => a.connected || a.running)
      const error = accounts.find(a => a.lastError)?.lastError ?? null
      const name = accounts[0]?.name || accounts[0]?.accountId || null

      const prevStatus = this.status

      if (connected) {
        this.status = 'connected'
        this.botName = name
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
              Connected${this.botName ? html` as <strong>${this.botName}</strong>` : nothing}
            </span>
          </div>
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
}
