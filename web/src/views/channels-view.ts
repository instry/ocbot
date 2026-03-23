import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

interface ChannelRow {
  id: string
  type?: string
  label?: string
  connected?: boolean
  lastActivity?: number
}

@customElement('ocbot-channels-view')
export class OcbotChannelsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() channels: ChannelRow[] = []
  @state() loading = true
  @state() error: string | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.loadChannels()
  }

  private async loadChannels() {
    this.loading = true
    this.error = null
    try {
      const result = await this.gateway.call<{ channels?: ChannelRow[] }>('channels.status')
      this.channels = result?.channels ?? []
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private getTimeAgo(ts: number | undefined): string {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60_000) return 'just now'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
    return `${Math.floor(diff / 86400_000)}d ago`
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; margin-bottom:20px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Channels</h2>
        </div>

        ${this.loading ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">Loading...</div>
        ` : this.error ? html`
          <div style="text-align:center; color:var(--danger); padding:40px;">${this.error}</div>
        ` : this.channels.length === 0 ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">
            <div>No channels configured</div>
          </div>
        ` : html`
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${this.channels.map(ch => html`
              <div class="session-card">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span
                    style="width:8px; height:8px; border-radius:50%; flex-shrink:0; background:${ch.connected ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'};"
                  ></span>
                  <span style="font-weight:500; color:var(--text-strong); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${ch.label || ch.id}
                  </span>
                  ${ch.type ? html`
                    <span style="font-size:12px; color:var(--muted); flex-shrink:0;">${ch.type}</span>
                  ` : nothing}
                </div>
                <div style="display:flex; gap:12px; margin-top:4px; font-size:13px; color:var(--muted);">
                  <span>${ch.connected ? 'Connected' : 'Disconnected'}</span>
                  ${ch.lastActivity ? html`
                    <span>Last activity: ${this.getTimeAgo(ch.lastActivity)}</span>
                  ` : nothing}
                </div>
              </div>
            `)}
          </div>
        `}
      </div>
    `
  }
}
