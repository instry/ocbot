import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { connectGateway, type GatewayClient, type GatewayState } from '../gateway/index'
import '../components/ocbot-sidebar'
import '../components/session-panel'
import '../components/provider-form'
import '../views/chat-view'
import '../views/sessions-view'
import '../views/cron-view'
import '../views/settings-view'
import '../views/agents-view'
import '../views/channels-view'
import '../views/usage-view'
import '../views/skills-view'
import '../views/models-view'
import '../views/pairing-view'

type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'models' | 'channels' | 'pairing' | 'usage' | 'settings'

@customElement('ocbot-app')
export class OcbotApp extends LitElement {
  override createRenderRoot() { return this }

  @state() tab: Tab = 'chat'
  @state() channelId: string | null = null
  @state() gatewayState: GatewayState = 'disconnected'
  @state() hasModels: boolean | null = null // null = still checking
  @state() chatSessionKey = `ocbot:${Date.now()}`
  @state() panelOpen = true
  @state() showOnboarding = false
  @state() showDisconnected = false

  private gateway!: GatewayClient
  private unsubState?: () => void
  private disconnectTimer?: ReturnType<typeof setTimeout>

  override connectedCallback() {
    super.connectedCallback()
    this._readHash()
    window.addEventListener('hashchange', this._readHash)

    this.gateway = connectGateway()
    this.gatewayState = this.gateway.state
    this.unsubState = this.gateway.onStateChange((s) => {
      this.gatewayState = s
      if (s === 'connected') {
        clearTimeout(this.disconnectTimer)
        this.showDisconnected = false
        this.checkModels()
      } else if (!this.showDisconnected) {
        // Grace period: only show "Reconnecting" after 2s of being disconnected
        clearTimeout(this.disconnectTimer)
        this.disconnectTimer = setTimeout(() => { this.showDisconnected = true }, 2000)
      }
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('hashchange', this._readHash)
    this.unsubState?.()
    clearTimeout(this.disconnectTimer)
  }

  private async checkModels() {
    try {
      const result = await this.gateway.call<{ config?: Record<string, any> }>('config.get')
      const config = result?.config
      const providers = config?.models?.providers
      const hasProviders = providers && typeof providers === 'object' && Object.keys(providers).length > 0
      if (!hasProviders) {
        const models = await this.gateway.call<{ models?: unknown[] }>('models.list')
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
    const raw = window.location.hash.replace('#/', '').split('?')[0] || 'chat'
    const parts = raw.split('/')
    const validTabs: Tab[] = ['chat', 'sessions', 'cron', 'agents', 'skills', 'models', 'channels', 'pairing', 'usage', 'settings']

    if (parts[0] === 'channels' && parts[1]) {
      this.tab = 'channels'
      this.channelId = parts[1]
    } else {
      this.tab = validTabs.includes(parts[0] as Tab) ? parts[0] as Tab : 'chat'
      this.channelId = null
    }
  }

  private _navigate(tab: Tab) {
    this.tab = tab
    this.channelId = null
    history.replaceState(null, '', `#/${tab}`)
  }

  private _onSelectSession(e: CustomEvent<string>) {
    this.chatSessionKey = e.detail
    this._navigate('chat')
  }

  private _onNewChat() {
    this.chatSessionKey = `ocbot:${Date.now()}`
    this._navigate('chat')
  }

  private _onModelsChanged() {
    this.checkModels()
  }

  private _onProviderSaved() {
    this.showOnboarding = false
    this.checkModels()
  }

  override render() {
    // Connecting screen — show immediately on first connect, with grace period on reconnect
    if (this.gatewayState !== 'connected' && (this.hasModels === null || this.showDisconnected)) {
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

    // Main UI
    const showPanel = this.tab === 'chat' && this.panelOpen

    return html`
      <div style="display:flex; height:100vh; width:100vw;">
        <ocbot-sidebar
          .activeTab=${this.tab}
          .gatewayState=${this.gatewayState}
          @navigate=${(e: CustomEvent<Tab>) => this._navigate(e.detail)}
        ></ocbot-sidebar>

        ${showPanel ? html`
          <ocbot-session-panel
            .gateway=${this.gateway}
            .activeSessionKey=${this.chatSessionKey}
            @select-session=${this._onSelectSession}
            @new-chat=${this._onNewChat}
          ></ocbot-session-panel>
        ` : ''}

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
          ? html`<ocbot-chat-view
              .gateway=${this.gateway}
              .sessionKey=${this.chatSessionKey}
              .panelOpen=${this.panelOpen}
              @toggle-panel=${() => { this.panelOpen = !this.panelOpen }}
              @session-changed=${(e: CustomEvent) => { this.chatSessionKey = e.detail }}
            ></ocbot-chat-view>`
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
        return html`<ocbot-channels-view
          .gateway=${this.gateway}
          .initialChannelId=${this.channelId}
          @channel-navigated=${(e: CustomEvent<string | null>) => {
            const id = e.detail
            if (id) {
              this.channelId = id
              history.replaceState(null, '', `#/channels/${id}`)
            } else {
              this.channelId = null
              history.replaceState(null, '', '#/channels')
            }
          }}
        ></ocbot-channels-view>`
      case 'pairing':
        return html`<ocbot-pairing-view .gateway=${this.gateway}></ocbot-pairing-view>`
      case 'models':
        return html`<ocbot-models-view .gateway=${this.gateway} @models-changed=${this._onModelsChanged}></ocbot-models-view>`
      case 'usage':
        return html`<ocbot-usage-view .gateway=${this.gateway}></ocbot-usage-view>`
      case 'settings':
        return html`<ocbot-settings-view .gateway=${this.gateway}></ocbot-settings-view>`
      default:
        return html``
    }
  }

  private _renderSetupPrompt() {
    if (this.showOnboarding) {
      return html`
        <div class="wizard">
          <div class="wizard__container">
            <img src="/logo.png" alt="Ocbot" class="wizard__logo" />
            <h2 class="wizard-step__title">Set up AI model</h2>
            <ocbot-provider-form
              .gateway=${this.gateway}
              .inline=${true}
              @provider-saved=${this._onProviderSaved}
              @provider-cancel=${() => { this.showOnboarding = false }}
            ></ocbot-provider-form>
          </div>
        </div>
      `
    }

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
            @click=${() => { this.showOnboarding = true }}
          >Get Started</button>
        </div>
      </div>
    `
  }
}
