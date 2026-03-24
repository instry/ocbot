import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

interface PairingRequest {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

interface ChannelPairingGroup {
  channel: string
  requests: PairingRequest[]
}

@customElement('ocbot-pairing-view')
export class OcbotPairingView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() groups: ChannelPairingGroup[] = []
  @state() loading = true
  @state() error: string | null = null
  @state() approving = new Set<string>()

  private pollTimer: ReturnType<typeof setInterval> | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.loadAll()
    this.pollTimer = setInterval(() => this.loadAll(), 10_000)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async loadAll() {
    try {
      // Get configured channels
      const status = await this.gateway.call<{
        channels?: Record<string, { configured?: boolean }>
      }>('channels.status')

      const channels = status?.channels ?? {}
      const configuredIds = Object.entries(channels)
        .filter(([, v]) => v.configured)
        .map(([id]) => id)

      // Fetch pairing requests for each configured channel
      const results = await Promise.all(
        configuredIds.map(async (channel) => {
          try {
            const result = await this.gateway.call<{
              channel: string
              requests: PairingRequest[]
            }>('channel.pairing.list', { channel })
            return { channel, requests: result?.requests ?? [] }
          } catch {
            return { channel, requests: [] }
          }
        }),
      )

      this.groups = results.filter((g) => g.requests.length > 0)
      this.error = null
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private async approve(channel: string, code: string) {
    const key = `${channel}:${code}`
    this.approving = new Set([...this.approving, key])
    this.requestUpdate()

    try {
      await this.gateway.call('channel.pairing.approve', { channel, code })
      await this.loadAll()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
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

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0 0 4px 0;">Pairing Requests</h2>
        <p style="font-size:14px; color:var(--muted); margin:0 0 20px 0;">
          Approve users who want to message your bot.
        </p>
        ${this.error ? html`
          <div style="color:var(--danger); margin-bottom:12px; font-size:13px;">${this.error}</div>
        ` : nothing}
        ${this.loading ? html`
          <div style="color:var(--muted); text-align:center; padding:40px;">Loading...</div>
        ` : this.groups.length === 0 ? html`
          <div style="text-align:center; padding:60px 20px;">
            <div style="font-size:16px; color:var(--muted); margin-bottom:8px;">No pending requests</div>
            <div style="font-size:13px; color:var(--muted);">
              When someone messages your bot on a pairing-enabled channel, their request will appear here.
            </div>
          </div>
        ` : html`
          ${this.groups.map((group) => this.renderGroup(group))}
        `}
      </div>
    `
  }

  private renderGroup(group: ChannelPairingGroup) {
    return html`
      <div style="margin-bottom:20px;">
        <div style="font-size:13px; font-weight:600; color:var(--text-strong); text-transform:capitalize; margin-bottom:8px;">
          ${group.channel}
        </div>
        ${group.requests.map((req) => this.renderRequest(group.channel, req))}
      </div>
    `
  }

  private renderRequest(channel: string, req: PairingRequest) {
    const key = `${channel}:${req.code}`
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
          @click=${() => this.approve(channel, req.code)}
        >${isApproving ? 'Approving...' : 'Approve'}</button>
      </div>
    `
  }
}
