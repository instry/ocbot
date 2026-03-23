import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { connectGateway, type GatewayClient, type GatewayState } from '../gateway/index'
import '../components/ocbot-sidebar'
import '../views/chat-view'

type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'channels' | 'usage' | 'config' | 'settings'

@customElement('ocbot-app')
export class OcbotApp extends LitElement {
  override createRenderRoot() { return this }

  @state() tab: Tab = 'chat'
  @state() gatewayState: GatewayState = 'disconnected'

  private gateway!: GatewayClient
  private unsubState?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this._readHash()
    window.addEventListener('hashchange', this._readHash)

    this.gateway = connectGateway()
    this.gatewayState = this.gateway.state
    this.unsubState = this.gateway.onStateChange((s) => {
      this.gatewayState = s
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('hashchange', this._readHash)
    this.unsubState?.()
  }

  private _readHash = () => {
    const hash = window.location.hash.replace('#/', '').split('?')[0] || 'chat'
    const validTabs: Tab[] = ['chat', 'sessions', 'cron', 'agents', 'skills', 'channels', 'usage', 'config', 'settings']
    this.tab = validTabs.includes(hash as Tab) ? hash as Tab : 'chat'
  }

  private _navigate(tab: Tab) {
    this.tab = tab
    history.replaceState(null, '', `#/${tab}`)
  }

  override render() {
    // Show connect screen while gateway is not ready
    if (this.gatewayState !== 'connected') {
      return html`
        <div style="display:flex; align-items:center; justify-content:center; height:100vh; width:100vw;">
          <div style="text-align:center;">
            <div style="font-size:48px; margin-bottom:16px;">🐙</div>
            <div style="font-size:18px; font-weight:600; color:var(--text-strong); margin-bottom:8px;">
              ${this.gatewayState === 'connecting' ? 'Connecting to Ocbot...' : 'Reconnecting...'}
            </div>
            <div style="font-size:14px; color:var(--muted);">Starting AI runtime, please wait.</div>
          </div>
        </div>
      `
    }

    return html`
      <div style="display:flex; height:100vh; width:100vw;">
        <ocbot-sidebar
          .activeTab=${this.tab}
          .gatewayState=${this.gatewayState}
          @navigate=${(e: CustomEvent<Tab>) => this._navigate(e.detail)}
        ></ocbot-sidebar>
        <main style="flex:1; overflow:hidden; display:flex; flex-direction:column;">
          ${this._renderContent()}
        </main>
      </div>
    `
  }

  private _renderContent() {
    switch (this.tab) {
      case 'chat':
        return html`<ocbot-chat-view .gateway=${this.gateway}></ocbot-chat-view>`
      case 'sessions':
        return html`<div class="page-placeholder"><h2>Sessions</h2><p style="color:var(--muted)">Coming soon</p></div>`
      case 'cron':
        return html`<div class="page-placeholder"><h2>Scheduled Tasks</h2><p style="color:var(--muted)">Coming soon</p></div>`
      case 'agents':
        return html`<div class="page-placeholder"><h2>Agents</h2><p style="color:var(--muted)">Coming soon</p></div>`
      case 'skills':
        return html`<div class="page-placeholder"><h2>Skills</h2><p style="color:var(--muted)">Coming soon</p></div>`
      case 'channels':
        return html`<div class="page-placeholder"><h2>Channels</h2><p style="color:var(--muted)">Coming soon</p></div>`
      case 'usage':
        return html`<div class="page-placeholder"><h2>Usage</h2><p style="color:var(--muted)">Coming soon</p></div>`
      case 'config':
        return html`<div class="page-placeholder"><h2>Configuration</h2><p style="color:var(--muted)">Coming soon</p></div>`
      case 'settings':
        return html`<div class="page-placeholder"><h2>Settings</h2><p style="color:var(--muted)">Coming soon</p></div>`
      default:
        return html``
    }
  }
}
