import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { connectGateway, type GatewayClient, type GatewayState } from '../gateway/index'
import '../components/ocbot-sidebar'
import '../views/chat-view'
import '../views/sessions-view'
import '../views/onboarding-view'
import '../views/cron-view'
import '../views/config-view'
import '../views/settings-view'
import '../views/agents-view'
import '../views/channels-view'
import '../views/usage-view'
import '../views/skills-view'

type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'channels' | 'usage' | 'config' | 'settings'

@customElement('ocbot-app')
export class OcbotApp extends LitElement {
  override createRenderRoot() { return this }

  @state() tab: Tab = 'chat'
  @state() gatewayState: GatewayState = 'disconnected'
  @state() needsOnboarding: boolean | null = null
  @state() chatSessionKey = 'ocbot:home'

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
      if (s === 'connected' && this.needsOnboarding === null) {
        this.checkOnboarding()
      }
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('hashchange', this._readHash)
    this.unsubState?.()
  }

  private async checkOnboarding() {
    try {
      const result = await this.gateway.call<{ models?: unknown[] }>('models.list')
      this.needsOnboarding = !result?.models?.length
    } catch {
      this.needsOnboarding = false
    }
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

  private _onSelectSession(e: CustomEvent<string>) {
    this.chatSessionKey = e.detail
    this._navigate('chat')
  }

  private _onOnboardingComplete() {
    this.needsOnboarding = false
  }

  override render() {
    if (this.gatewayState !== 'connected') {
      return html`
        <div style="display:flex; align-items:center; justify-content:center; height:100vh; width:100vw;">
          <div style="text-align:center;">
            <img src="/logo.png" alt="Ocbot" style="width:64px; height:64px; margin-bottom:16px;" />
            <div style="font-size:18px; font-weight:600; color:var(--text-strong); margin-bottom:8px;">
              ${this.gatewayState === 'connecting' ? 'Connecting to Ocbot...' : 'Reconnecting...'}
            </div>
            <div style="font-size:14px; color:var(--muted);">Starting AI runtime, please wait.</div>
          </div>
        </div>
      `
    }

    if (this.needsOnboarding === true) {
      return html`
        <ocbot-onboarding
          .gateway=${this.gateway}
          @onboarding-complete=${this._onOnboardingComplete}
        ></ocbot-onboarding>
      `
    }

    if (this.needsOnboarding === null) {
      return html`
        <div style="display:flex; align-items:center; justify-content:center; height:100vh; width:100vw;">
          <div style="font-size:14px; color:var(--muted);">Loading...</div>
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
        return html`<ocbot-chat-view .gateway=${this.gateway} .sessionKey=${this.chatSessionKey}></ocbot-chat-view>`
      case 'sessions':
        return html`<ocbot-sessions-view .gateway=${this.gateway} @select-session=${this._onSelectSession}></ocbot-sessions-view>`
      case 'cron':
        return html`<ocbot-cron-view .gateway=${this.gateway}></ocbot-cron-view>`
      case 'agents':
        return html`<ocbot-agents-view .gateway=${this.gateway}></ocbot-agents-view>`
      case 'skills':
        return html`<ocbot-skills-view .gateway=${this.gateway}></ocbot-skills-view>`
      case 'channels':
        return html`<ocbot-channels-view .gateway=${this.gateway}></ocbot-channels-view>`
      case 'usage':
        return html`<ocbot-usage-view .gateway=${this.gateway}></ocbot-usage-view>`
      case 'config':
        return html`<ocbot-config-view .gateway=${this.gateway}></ocbot-config-view>`
      case 'settings':
        return html`<ocbot-settings-view></ocbot-settings-view>`
      default:
        return html``
    }
  }
}
