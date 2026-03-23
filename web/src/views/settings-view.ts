import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import type { ConfiguredProvider } from '../components/provider-form'
import { svgIcon } from '../components/icons'
import '../components/provider-form'

declare const __OCBOT_VERSION__: string

type SettingsTab = 'models' | 'general' | 'about'
type ModelsView = 'list' | 'add' | 'edit'
type ThemeMode = 'system' | 'light' | 'dark'

@customElement('ocbot-settings-view')
export class OcbotSettingsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() activeTab: SettingsTab = 'models'
  @state() modelsView: ModelsView = 'list'
  @state() theme: ThemeMode = 'system'
  @state() providers: ConfiguredProvider[] = []
  @state() loadingProviders = true
  @state() editingProvider: ConfiguredProvider | null = null

  override connectedCallback() {
    super.connectedCallback()
    const stored = localStorage.getItem('ocbot.theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      this.theme = stored
    }
    this.applyTheme(this.theme)
    this.loadProviders()
  }

  private async loadProviders() {
    this.loadingProviders = true
    try {
      const result = await this.gateway.call<{ config?: Record<string, any>; hash?: string }>('config.get')
      const config = result?.config ?? {}
      const profiles: Record<string, any> = config?.auth?.profiles ?? {}
      const defaultModel: string = config?.agents?.defaults?.model?.primary ?? ''

      const list: ConfiguredProvider[] = []
      for (const [key, profile] of Object.entries(profiles)) {
        const provider = profile.provider ?? key.split(':')[0] ?? ''
        const hint = this.getProviderLabel(provider)
        list.push({
          profileKey: key,
          provider,
          label: hint,
          apiKey: profile.apiKey ?? '',
          baseUrl: profile.baseUrl,
          modelId: defaultModel.startsWith(`${provider}/`) ? defaultModel.split('/').slice(1).join('/') : undefined,
          isDefault: defaultModel.startsWith(`${provider}/`),
        })
      }
      this.providers = list
    } catch {
      this.providers = []
    } finally {
      this.loadingProviders = false
    }
  }

  private getProviderLabel(provider: string): string {
    const labels: Record<string, string> = {
      anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google',
      deepseek: 'DeepSeek', xai: 'xAI', openrouter: 'OpenRouter',
      mistral: 'Mistral', qwen: 'Qwen', moonshot: 'Kimi / Moonshot',
      minimax: 'MiniMax', ollama: 'Ollama',
    }
    return labels[provider] ?? provider
  }

  private setTheme(mode: ThemeMode) {
    this.theme = mode
    localStorage.setItem('ocbot.theme', mode)
    this.applyTheme(mode)
  }

  private applyTheme(mode: ThemeMode) {
    const root = document.documentElement
    if (mode === 'system') {
      root.removeAttribute('data-theme-mode')
    } else {
      root.setAttribute('data-theme-mode', mode)
    }
  }

  private get version(): string {
    try {
      return typeof __OCBOT_VERSION__ !== 'undefined' ? __OCBOT_VERSION__ : 'dev'
    } catch {
      return 'dev'
    }
  }

  private async deleteProvider(profileKey: string) {
    try {
      const result = await this.gateway.call<{ config?: Record<string, any>; hash?: string }>('config.get')
      const config = result?.config ?? {}
      const hash = result?.hash ?? ''
      const profiles = { ...(config?.auth?.profiles ?? {}) }
      delete profiles[profileKey]

      const patch: Record<string, any> = {
        auth: { profiles },
      }

      await this.gateway.call('config.patch', {
        baseHash: hash,
        raw: JSON.stringify(patch),
      })

      this.dispatchEvent(new CustomEvent('models-changed', { bubbles: true, composed: true }))
      await this.loadProviders()
    } catch (err) {
      console.error('Failed to delete provider:', err)
    }
  }

  private handleProviderSaved() {
    this.modelsView = 'list'
    this.editingProvider = null
    this.loadProviders()
    this.dispatchEvent(new CustomEvent('models-changed', { bubbles: true, composed: true }))
  }

  private handleProviderCancel() {
    this.modelsView = 'list'
    this.editingProvider = null
  }

  override render() {
    const tabs: { id: SettingsTab; icon: string; label: string }[] = [
      { id: 'models', icon: 'cpu', label: 'Models' },
      { id: 'general', icon: 'sliders', label: 'General' },
      { id: 'about', icon: 'info', label: 'About' },
    ]

    return html`
      <div class="settings">
        <!-- Sub-nav sidebar -->
        <div class="settings__nav">
          <div class="settings__nav-header">Settings</div>
          <nav class="settings__nav-items">
            ${tabs.map(t => html`
              <button
                class="settings__nav-btn ${this.activeTab === t.id ? 'settings__nav-btn--active' : ''}"
                @click=${() => { this.activeTab = t.id; if (t.id === 'models') this.modelsView = 'list' }}
              >
                <span class="settings__nav-icon">${svgIcon(t.icon, 16)}</span>
                <span>${t.label}</span>
              </button>
            `)}
          </nav>
        </div>

        <!-- Content area -->
        <div class="settings__content">
          ${this.activeTab === 'models' ? this._renderModelsTab() : nothing}
          ${this.activeTab === 'general' ? this._renderGeneralTab() : nothing}
          ${this.activeTab === 'about' ? this._renderAboutTab() : nothing}
        </div>
      </div>
    `
  }

  /* ───────── Models Tab ───────── */

  private _renderModelsTab() {
    if (this.modelsView === 'add') {
      return html`
        <div class="settings__page">
          <button class="settings__back-btn" @click=${() => this.handleProviderCancel()}>
            &larr; Back to Models
          </button>
          <h2 class="settings__page-title">Add Provider</h2>
          <div class="settings__form-container">
            <ocbot-provider-form
              .gateway=${this.gateway}
              @provider-saved=${() => this.handleProviderSaved()}
              @provider-cancel=${() => this.handleProviderCancel()}
            ></ocbot-provider-form>
          </div>
        </div>
      `
    }

    if (this.modelsView === 'edit' && this.editingProvider) {
      return html`
        <div class="settings__page">
          <button class="settings__back-btn" @click=${() => this.handleProviderCancel()}>
            &larr; Back to Models
          </button>
          <h2 class="settings__page-title">Edit Provider</h2>
          <p class="settings__page-subtitle">${this.editingProvider.label}</p>
          <div class="settings__form-container">
            <ocbot-provider-form
              .gateway=${this.gateway}
              .editProfileKey=${this.editingProvider.profileKey}
              .editData=${this.editingProvider}
              @provider-saved=${() => this.handleProviderSaved()}
              @provider-cancel=${() => this.handleProviderCancel()}
            ></ocbot-provider-form>
          </div>
        </div>
      `
    }

    // List view
    return html`
      <div class="settings__page">
        <h2 class="settings__page-title">Models</h2>
        <p class="settings__page-subtitle">Manage your AI model providers and API keys.</p>

        <div class="settings__provider-list">
          ${this.loadingProviders ? html`
            <div class="settings__empty">Loading...</div>
          ` : this.providers.length === 0 ? html`
            <div class="settings__empty">No providers configured yet. Add one to get started.</div>
          ` : this.providers.map(p => this._renderProviderCard(p))}

          <button
            class="settings__add-btn"
            @click=${() => { this.modelsView = 'add' }}
          >+ Add Provider</button>
        </div>
      </div>
    `
  }

  private _renderProviderCard(p: ConfiguredProvider) {
    const initials = p.label.slice(0, 2).toUpperCase()
    return html`
      <div class="settings__provider-card ${p.isDefault ? 'settings__provider-card--default' : ''}">
        <div class="settings__provider-info">
          <div class="settings__provider-avatar">${initials}</div>
          <div class="settings__provider-details">
            <div class="settings__provider-name-row">
              <span class="settings__provider-name">${p.profileKey}</span>
              <span class="settings__provider-badge">${p.label}</span>
              ${p.isDefault ? html`
                <span class="settings__provider-default-badge">&#9733; Default</span>
              ` : nothing}
            </div>
            ${p.modelId ? html`
              <div class="settings__provider-model">${p.modelId}</div>
            ` : nothing}
          </div>
        </div>
        <div class="settings__provider-actions">
          <button
            class="settings__icon-btn"
            title="Edit"
            @click=${() => { this.editingProvider = p; this.modelsView = 'edit' }}
          >&#9998;</button>
          <button
            class="settings__icon-btn settings__icon-btn--danger"
            title="Delete"
            @click=${() => this.deleteProvider(p.profileKey)}
          >&#10005;</button>
        </div>
      </div>
    `
  }

  /* ───────── General Tab ───────── */

  private _renderGeneralTab() {
    const themes: { value: ThemeMode; label: string; icon: string }[] = [
      { value: 'system', label: 'System', icon: 'monitor' },
      { value: 'light', label: 'Light', icon: 'sun' },
      { value: 'dark', label: 'Dark', icon: 'moon' },
    ]

    return html`
      <div class="settings__page">
        <h2 class="settings__page-title">General</h2>

        <div class="settings__sections">
          <!-- Appearance -->
          <div class="settings__section">
            <h3 class="settings__section-title">Appearance</h3>
            <div class="settings__section-card">
              <div class="settings__row">
                <div class="settings__row-info">
                  <span class="settings__row-title">Color Scheme</span>
                  <span class="settings__row-desc">Choose your preferred theme</span>
                </div>
                <div class="settings__theme-toggle">
                  ${themes.map(t => html`
                    <button
                      class="settings__theme-btn ${this.theme === t.value ? 'settings__theme-btn--active' : ''}"
                      @click=${() => this.setTheme(t.value)}
                    >
                      <span class="settings__theme-icon">${svgIcon(t.icon, 14)}</span>
                      ${t.label}
                    </button>
                  `)}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    `
  }

  private _renderAboutTab() {
    const faqs = [
      { q: 'What are you exactly?', a: "I'm a new species! Part browser, part AI agent. Think of me as a very helpful octopus that lives in your browser tabs." },
      { q: 'Why the name "ocbot"?', a: 'Because "octo" means 8! I\'m an octopus-inspired bot with eight arms ready to multitask across the web.' },
      { q: 'Why purple?', a: "Because I'm hitting the big time — only royalty gets to be purple. Plus it's the color of a certain deep-sea creature." },
      { q: 'Your avatar only has 5 arms.', a: 'The other 3 are hidden behind me, duh.' },
      { q: 'Will you leak my data?', a: "Nope! All your data is stored locally in your browser. I don't phone home. Your conversations, your skills, your settings — all yours." },
    ]

    const socials = [
      { name: 'X', url: 'https://x.com/ocbot_ai' },
      { name: 'Instagram', url: 'https://instagram.com/ocbot_ai' },
      { name: 'YouTube', url: 'https://youtube.com/@ocbot_ai' },
      { name: 'Discord', url: 'https://discord.gg/ocbot_ai' },
      { name: 'TikTok', url: 'https://tiktok.com/@ocbot_ai' },
    ]

    return html`
      <div class="settings__tab-content">
        <div class="about">
          <!-- Avatar + Name -->
          <div class="about__hero">
            <div class="about__avatar">
              <img src="/logo.png" alt="Ocbot" style="width:48px; height:48px;" />
            </div>
            <h1 class="about__name">ocbot</h1>
            <p class="about__tagline">Got brains, got arms, up before the alarm.</p>
          </div>

          <!-- Intro -->
          <div class="about__card">
            <p class="about__intro">
              My name is ocbot. I'm super smart and super quick at getting things done.
              I live inside your browser with eight nimble arms ready to handle any task.
              Ask me to find info, fill forms, compare products, or automate your online work.
              I don't sleep, I don't forget, and I'm always ready.
            </p>
          </div>

          <!-- FAQ -->
          <div class="about__section">
            <h2 class="about__section-title">${svgIcon('message-question', 16)} FAQ</h2>
            <div class="about__faq-list">
              ${faqs.map(f => html`
                <div class="about__card">
                  <p class="about__faq-q">Q: ${f.q}</p>
                  <p class="about__faq-a">${f.a}</p>
                </div>
              `)}
            </div>
          </div>

          <!-- Contact & Socials -->
          <div class="about__footer">
            <div class="about__links">
              <a href="https://oc.bot" target="_blank" rel="noopener">${svgIcon('globe', 14)} oc.bot</a>
              <a href="mailto:hi@oc.bot">${svgIcon('mail', 14)} hi@oc.bot</a>
            </div>
            <div class="about__socials">
              ${socials.map(s => html`
                <a href=${s.url} target="_blank" rel="noopener" class="about__social-pill">${s.name}</a>
              `)}
            </div>
            <div class="about__version">v${this.version}</div>
          </div>
        </div>
      </div>
    `
  }
}
