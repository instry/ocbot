import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { connectGateway, type GatewayClient, type GatewayState } from '../gateway/index'
import '../components/ocbot-sidebar'
import '../components/session-panel'
import '../components/wizard-step'
import type { WizardStep } from '../components/wizard-step'
import '../views/chat-view'
import '../views/sessions-view'
import '../views/cron-view'
import '../views/settings-view'
import '../views/agents-view'
import '../views/channels-view'
import '../views/usage-view'
import '../views/skills-view'

type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'channels' | 'usage' | 'settings'

@customElement('ocbot-app')
export class OcbotApp extends LitElement {
  override createRenderRoot() { return this }

  @state() tab: Tab = 'chat'
  @state() channelId: string | null = null
  @state() gatewayState: GatewayState = 'disconnected'
  @state() hasModels: boolean | null = null // null = still checking
  @state() chatSessionKey = `ocbot:${Date.now()}`
  @state() panelOpen = true
  @state() wizardSessionId: string | null = null
  @state() wizardStep: WizardStep | null = null
  @state() wizardLoading = false
  @state() wizardError: string | null = null

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
      // Check if user has configured any model providers with API keys,
      // or if local models (Ollama) are available.
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
    const validTabs: Tab[] = ['chat', 'sessions', 'cron', 'agents', 'skills', 'channels', 'usage', 'settings']

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

  private async _startWizard() {
    if (this.wizardSessionId) return
    this.wizardLoading = true
    this.wizardError = null
    try {
      const result = await this.gateway.call<{
        sessionId: string
        done: boolean
        step?: WizardStep
        status: string
        error?: string
      }>('wizard.start', { mode: 'local' })
      this.wizardSessionId = result.sessionId
      if (result.done) {
        this._onWizardDone()
      } else if (result.step) {
        this.wizardStep = result.step
      } else {
        this.wizardSessionId = null
        this.wizardError = 'Wizard started but returned no step'
      }
    } catch (err) {
      this.wizardError = err instanceof Error ? err.message : 'Failed to start wizard'
    } finally {
      this.wizardLoading = false
    }
  }

  private async _onWizardAnswer(e: CustomEvent<{ stepId: string; value: unknown }>) {
    if (!this.wizardSessionId) return
    this.wizardLoading = true
    this.wizardError = null
    try {
      const result = await this.gateway.call<{
        done: boolean
        step?: WizardStep
        status: string
        error?: string
      }>('wizard.next', {
        sessionId: this.wizardSessionId,
        answer: e.detail,
      })
      if (result.done) {
        this._onWizardDone()
      } else if (result.step) {
        this.wizardStep = result.step
      } else if (result.error) {
        this.wizardError = result.error
      }
    } catch (err) {
      this.wizardError = err instanceof Error ? err.message : 'Wizard error'
    } finally {
      this.wizardLoading = false
    }
  }

  private async _cancelWizard() {
    if (this.wizardSessionId) {
      try {
        await this.gateway.call('wizard.cancel', { sessionId: this.wizardSessionId })
      } catch { /* ignore */ }
    }
    this.wizardSessionId = null
    this.wizardStep = null
    this.wizardLoading = false
    this.wizardError = null
  }

  private _onWizardDone() {
    this.wizardSessionId = null
    this.wizardStep = null
    this.wizardLoading = false
    this.wizardError = null
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
      case 'usage':
        return html`<ocbot-usage-view .gateway=${this.gateway}></ocbot-usage-view>`
      case 'settings':
        return html`<ocbot-settings-view .gateway=${this.gateway} @models-changed=${this._onModelsChanged}></ocbot-settings-view>`
      default:
        return html``
    }
  }

  private _renderSetupPrompt() {
    // Wizard is active — show step renderer
    if (this.wizardSessionId && this.wizardStep) {
      return html`
        <div class="wizard">
          <div class="wizard__container">
            <img src="/logo.png" alt="Ocbot" class="wizard__logo" />
            ${this.wizardError
              ? html`<div class="wizard__error">${this.wizardError}</div>`
              : ''}
            <ocbot-wizard-step
              .step=${this.wizardStep}
              .loading=${this.wizardLoading}
              @wizard-answer=${this._onWizardAnswer}
            ></ocbot-wizard-step>
            <button
              class="wizard__cancel"
              @click=${this._cancelWizard}
              ?disabled=${this.wizardLoading}
            >Cancel</button>
          </div>
        </div>
      `
    }

    // Default: show setup prompt with "Start Setup" button
    return html`
      <div style="display:flex; align-items:center; justify-content:center; height:100%; padding:24px;">
        <div style="text-align:center; max-width:400px;">
          <img src="/logo.png" alt="Ocbot" style="width:64px; height:64px; margin-bottom:16px;" />
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0 0 8px;">Set up AI model</h2>
          <p style="font-size:14px; color:var(--muted); margin:0 0 24px; line-height:1.6;">
            Configure an AI provider to start chatting. You can also use a local model with Ollama.
          </p>
          <div style="display:flex; gap:12px; justify-content:center;">
            <button
              class="setup-prompt__btn"
              ?disabled=${this.wizardLoading}
              @click=${this._startWizard}
            >${this.wizardLoading ? 'Starting...' : 'Start Setup'}</button>
            <button
              class="setup-prompt__btn setup-prompt__btn--secondary"
              @click=${() => this._navigate('settings')}
            >Manual Setup</button>
          </div>
          ${this.wizardError
            ? html`<div class="wizard__error" style="margin-top:16px;">${this.wizardError}</div>`
            : ''}
        </div>
      </div>
    `
  }
}
