import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import '../components/ocbot-sidebar'

type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'channels' | 'usage' | 'config' | 'settings'

@customElement('ocbot-app')
export class OcbotApp extends LitElement {
  override createRenderRoot() { return this }

  @state() tab: Tab = 'chat'
  @state() gatewayState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'

  override connectedCallback() {
    super.connectedCallback()
    this._readHash()
    window.addEventListener('hashchange', this._readHash)
    // TODO: connect to gateway in Phase 1
    this.gatewayState = 'connected'
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('hashchange', this._readHash)
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
    return html`
      <div style="display:flex; height:100vh; width:100vw;">
        <ocbot-sidebar
          .activeTab=${this.tab}
          .gatewayState=${this.gatewayState}
          @navigate=${(e: CustomEvent<Tab>) => this._navigate(e.detail)}
        ></ocbot-sidebar>
        <main style="flex:1; overflow:auto; padding:24px;">
          ${this._renderContent()}
        </main>
      </div>
    `
  }

  private _renderContent() {
    switch (this.tab) {
      case 'chat':
        return html`<div class="page-placeholder"><h2>Chat</h2><p style="color:var(--muted)">Gateway chat coming in Phase 1</p></div>`
      case 'sessions':
        return html`<div class="page-placeholder"><h2>Sessions</h2><p style="color:var(--muted)">Session management coming in Phase 2</p></div>`
      case 'cron':
        return html`<div class="page-placeholder"><h2>Scheduled Tasks</h2><p style="color:var(--muted)">Cron management coming in Phase 4</p></div>`
      case 'agents':
        return html`<div class="page-placeholder"><h2>Agents</h2><p style="color:var(--muted)">Agent management coming in Phase 3</p></div>`
      case 'skills':
        return html`<div class="page-placeholder"><h2>Skills</h2><p style="color:var(--muted)">Skills catalog coming in Phase 4</p></div>`
      case 'channels':
        return html`<div class="page-placeholder"><h2>Channels</h2><p style="color:var(--muted)">Channel configuration coming in Phase 3</p></div>`
      case 'usage':
        return html`<div class="page-placeholder"><h2>Usage</h2><p style="color:var(--muted)">Usage analytics coming in Phase 4</p></div>`
      case 'config':
        return html`<div class="page-placeholder"><h2>Configuration</h2><p style="color:var(--muted)">Config editor coming in Phase 3</p></div>`
      case 'settings':
        return html`<div class="page-placeholder"><h2>Settings</h2><p style="color:var(--muted)">Theme, language, about</p></div>`
      default:
        return html`<div>Unknown page</div>`
    }
  }
}
