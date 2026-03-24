import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import type { ConfiguredProvider } from '../components/provider-form'
import '../components/provider-form'

type ModelsView = 'list' | 'add' | 'edit'

@customElement('ocbot-models-view')
export class OcbotModelsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() modelsView: ModelsView = 'list'
  @state() providers: ConfiguredProvider[] = []
  @state() loadingProviders = true
  @state() editingProvider: ConfiguredProvider | null = null

  override connectedCallback() {
    super.connectedCallback()
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

  private async deleteProvider(profileKey: string) {
    if (!confirm(`Are you sure you want to delete "${profileKey}"?`)) return

    try {
      const result = await this.gateway.call<{ config?: Record<string, any>; hash?: string }>('config.get')
      const config = result?.config ?? {}
      const hash = result?.hash ?? ''

      const provider = profileKey.split(':')[0] ?? ''

      const patch: Record<string, any> = {
        auth: { profiles: { [profileKey]: null } },
      }

      // Also remove the provider config from models.providers
      if (provider && config?.models?.providers?.[provider]) {
        patch.models = { providers: { [provider]: null } }
      }

      // Clear default model if it references this provider
      const defaultModel: string = config?.agents?.defaults?.model?.primary ?? ''
      if (provider && defaultModel.startsWith(`${provider}/`)) {
        patch.agents = { defaults: { model: { primary: '' } } }
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
}
