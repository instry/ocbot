import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { connectGateway, type GatewayClient, type GatewayState } from '../gateway/index'
import '../views/chat-view'

@customElement('ocbot-sidepanel')
export class OcbotSidepanel extends LitElement {
  override createRenderRoot() { return this }

  @state() gatewayState: GatewayState = 'disconnected'

  private gateway!: GatewayClient
  private unsubState?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.gateway = connectGateway()
    this.gatewayState = this.gateway.state
    this.unsubState = this.gateway.onStateChange((s) => {
      this.gatewayState = s
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubState?.()
  }

  override render() {
    if (this.gatewayState !== 'connected') {
      return html`
        <div style="display:flex; align-items:center; justify-content:center; height:100vh; color:var(--muted);">
          <div style="text-align:center;">
            <img src="/logo.png" alt="Ocbot" style="width:32px; height:32px; margin-bottom:8px;" />
            <div style="font-size:14px;">Connecting...</div>
          </div>
        </div>
      `
    }

    return html`
      <div style="display:flex; flex-direction:column; height:100vh;">
        <!-- Compact header -->
        <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid var(--border);">
          <img src="/logo.png" alt="" style="width:18px; height:18px;" />
          <span style="font-weight:600; font-size:13px; color:var(--text-strong);">Ocbot</span>
          <span style="font-size:10px; color:var(--ok);">●</span>
        </div>

        <!-- Chat -->
        <div style="flex:1; overflow:hidden;">
          <ocbot-chat-view .gateway=${this.gateway}></ocbot-chat-view>
        </div>
      </div>
    `
  }
}
