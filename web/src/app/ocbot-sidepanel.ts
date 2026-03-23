import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { connectGateway, type GatewayClient, type GatewayState } from '../gateway/index'
import '../views/chat-view'

@customElement('ocbot-sidepanel')
export class OcbotSidepanel extends LitElement {
  override createRenderRoot() { return this }

  @state() gatewayState: GatewayState = 'disconnected'
  @state() hasModels: boolean | null = null

  private gateway!: GatewayClient
  private unsubState?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.gateway = connectGateway()
    this.gatewayState = this.gateway.state
    this.unsubState = this.gateway.onStateChange((s) => {
      this.gatewayState = s
      if (s === 'connected') this.checkModels()
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubState?.()
  }

  private async checkModels() {
    try {
      const result = await this.gateway.call<{ models?: unknown[] }>('models.list')
      this.hasModels = !!(result?.models?.length)
    } catch {
      this.hasModels = false
    }
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

        <!-- Chat or setup prompt -->
        <div style="flex:1; overflow:hidden;">
          ${this.hasModels === null
            ? html`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);">Loading...</div>`
            : this.hasModels
            ? html`<ocbot-chat-view .gateway=${this.gateway}></ocbot-chat-view>`
            : html`
              <div style="display:flex; align-items:center; justify-content:center; height:100%; padding:16px;">
                <div style="text-align:center;">
                  <img src="/logo.png" alt="" style="width:48px; height:48px; margin-bottom:12px;" />
                  <div style="font-size:14px; font-weight:500; color:var(--text-strong); margin-bottom:4px;">No AI model configured</div>
                  <div style="font-size:13px; color:var(--muted);">Open <b>oc://home</b> to set up a provider.</div>
                </div>
              </div>
            `
          }
        </div>
      </div>
    `
  }
}
