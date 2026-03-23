import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { connectGateway, type GatewayClient, type GatewayState } from '../gateway/index'
import '../components/ocbot-sidebar'
import '../views/chat-view'
import '../views/sessions-view'
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
  @state() hasModels: boolean | null = null // null = still checking
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
      if (s === 'connected') {
        this.checkModels()
      }
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('hashchange', this._readHash)
    this.unsubState?.()
  }

  private async checkModels() {
    try {
      // Check if user has configured any auth profiles (API keys).
      // models.list returns static catalog even without credentials,
      // so we check config for actual provider setup instead.
      const result = await this.gateway.call<{ config?: Record<string, any> }>('config.get')
      const config = result?.config
      const authProfiles = config?.auth?.profiles
      const hasAuth = authProfiles && typeof authProfiles === 'object' && Object.keys(authProfiles).length > 0
      // Also check if Ollama or other local models are discovered
      if (!hasAuth) {
        const models = await this.gateway.call<{ models?: unknown[] }>('models.list')
        // Only count models from providers that don't need API keys (ollama, vllm, sglang)
        const localModels = (models?.models as any[] ?? []).filter(
          (m: any) => ['ollama', 'vllm', 'sglang'].includes(m.provider)
        )
        this.hasModels = localModels.length > 0
      } else {
        this.hasModels = true
      }
    } catch {
      this.hasModels = false
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

  private _onModelsChanged() {
    this.checkModels()
  }

  override render() {
    // Connecting screen
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

    // Main UI — always accessible, no onboarding block
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
        if (this.hasModels === null) {
          return html`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);">Loading...</div>`
        }
        return this.hasModels
          ? html`<ocbot-chat-view .gateway=${this.gateway} .sessionKey=${this.chatSessionKey}></ocbot-chat-view>`
          : this._renderSetupPrompt()
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
        return html`<ocbot-config-view .gateway=${this.gateway} @config-saved=${this._onModelsChanged}></ocbot-config-view>`
      case 'settings':
        return html`<ocbot-settings-view .gateway=${this.gateway} @models-changed=${this._onModelsChanged}></ocbot-settings-view>`
      default:
        return html``
    }
  }

  private _renderSetupPrompt() {
    return html`
      <div style="display:flex; align-items:center; justify-content:center; height:100%; padding:24px;">
        <div style="text-align:center; max-width:400px;">
          <img src="/logo.png" alt="Ocbot" style="width:64px; height:64px; margin-bottom:16px;" />
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0 0 8px;">Set up AI model</h2>
          <p style="font-size:14px; color:var(--muted); margin:0 0 24px; line-height:1.6;">
            Configure an AI provider to start chatting. You can also use a local model with Ollama.
          </p>
          <button
            class="setup-prompt__btn"
            @click=${() => this._navigate('settings')}
          >Go to Settings</button>
        </div>
      </div>
    `
  }
}
