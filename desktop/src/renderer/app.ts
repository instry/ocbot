import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import './components/ocbot-sidebar'
import './components/session-panel'
import './views/chat-view'
import { getGatewayClient } from './gateway'

@customElement('ocbot-app')
export class OcbotApp extends LitElement {
  @state() private tab = 'chat'
  @state() private gatewayState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
  @state() private sessionKey = ''

  createRenderRoot() {
    return this // No shadow DOM
  }

  connectedCallback() {
    super.connectedCallback()
    this.connectGateway()
  }

  private async connectGateway() {
    const gateway = getGatewayClient()
    gateway.onStateChange((state) => {
      this.gatewayState = state
    })
    await gateway.connect()
  }

  private handleNavigate(e: CustomEvent) {
    this.tab = e.detail.tab
  }

  private handleNewChat() {
    this.sessionKey = 'ocbot:' + Date.now()
    this.tab = 'chat'
  }

  private handleSelectSession(e: CustomEvent) {
    this.sessionKey = e.detail.sessionKey
    this.tab = 'chat'
  }

  render() {
    if (this.gatewayState !== 'connected') {
      return html`
        <div style="display:flex; height:100vh; align-items:center; justify-content:center;">
          <div style="text-align:center;">
            <h2>Connecting to Ocbot...</h2>
            <p style="color:var(--muted); margin-top:8px;">Starting AI runtime</p>
          </div>
        </div>
      `
    }

    return html`
      <div style="display:flex; height:100vh; overflow:hidden;">
        <ocbot-sidebar
          .activeTab=${this.tab}
          @navigate=${this.handleNavigate}
        ></ocbot-sidebar>

        ${this.tab === 'chat' ? html`
          <ocbot-session-panel
            @new-chat=${this.handleNewChat}
            @select-session=${this.handleSelectSession}
          ></ocbot-session-panel>
        ` : ''}

        <main style="flex:1; overflow:hidden;">
          ${this.tab === 'chat' ? html`
            <ocbot-chat-view .sessionKey=${this.sessionKey}></ocbot-chat-view>
          ` : html`
            <div style="padding:24px;">
              <h2>${this.tab}</h2>
              <p style="color:var(--muted);">Coming soon</p>
            </div>
          `}
        </main>
      </div>
    `
  }
}
