import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

// --- Static UI hints for providers (API key URLs, regions, placeholders) ---
// Model lists come dynamically from gateway models.list

interface ProviderHint {
  label: string
  apiKeyUrl?: string
  apiKeyPlaceholder?: string
  regions?: { id: string; label: string; baseUrl: string }[]
}

const PROVIDER_HINTS: Record<string, ProviderHint> = {
  anthropic: {
    label: 'Anthropic',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-...',
  },
  openai: {
    label: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyPlaceholder: 'sk-...',
  },
  google: {
    label: 'Google',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeyPlaceholder: 'AI...',
  },
  deepseek: {
    label: 'DeepSeek',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    apiKeyPlaceholder: 'sk-...',
  },
  xai: {
    label: 'xAI',
    apiKeyUrl: 'https://console.x.ai/team/default/api-keys',
    apiKeyPlaceholder: 'xai-...',
  },
  openrouter: {
    label: 'OpenRouter',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiKeyPlaceholder: 'sk-or-...',
  },
  mistral: {
    label: 'Mistral',
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    apiKeyPlaceholder: 'API key',
  },
  qwen: {
    label: 'Qwen',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    apiKeyPlaceholder: 'sk-...',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
      { id: 'cn', label: 'China', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    ],
  },
  moonshot: {
    label: 'Kimi / Moonshot',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    apiKeyPlaceholder: 'sk-...',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.moonshot.ai/v1' },
      { id: 'cn', label: 'China', baseUrl: 'https://api.moonshot.cn/v1' },
    ],
  },
  minimax: {
    label: 'MiniMax',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    apiKeyPlaceholder: 'API key',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.minimax.io/v1' },
      { id: 'cn', label: 'China', baseUrl: 'https://api.minimaxi.com/v1' },
    ],
  },
  ollama: {
    label: 'Ollama (Local)',
    apiKeyPlaceholder: '(not required)',
  },
}

interface GatewayModel {
  id: string
  name: string
  provider: string
}

@customElement('ocbot-provider-form')
export class OcbotProviderForm extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property({ type: Boolean }) inline = false  // inline mode for setup prompt

  @state() providers: string[] = []
  @state() modelsByProvider: Record<string, GatewayModel[]> = {}
  @state() selectedProvider = ''
  @state() selectedRegion = ''
  @state() apiKey = ''
  @state() selectedModel = ''
  @state() saving = false
  @state() error: string | null = null
  @state() success = false
  @state() loading = true

  override connectedCallback() {
    super.connectedCallback()
    this.loadModels()
  }

  private async loadModels() {
    this.loading = true
    try {
      const result = await this.gateway.call<{ models?: GatewayModel[] }>('models.list')
      const models = result?.models ?? []
      const byProvider: Record<string, GatewayModel[]> = {}
      for (const m of models) {
        if (!byProvider[m.provider]) byProvider[m.provider] = []
        byProvider[m.provider].push(m)
      }
      this.modelsByProvider = byProvider
      // Order: providers with hints first, then others
      const hinted = Object.keys(PROVIDER_HINTS).filter(p => byProvider[p])
      const others = Object.keys(byProvider).filter(p => !PROVIDER_HINTS[p]).sort()
      this.providers = [...hinted, ...others]
    } catch {
      this.error = 'Failed to load models'
    } finally {
      this.loading = false
    }
  }

  private getHint(provider: string): ProviderHint {
    return PROVIDER_HINTS[provider] ?? { label: provider }
  }

  private selectProvider(provider: string) {
    this.selectedProvider = provider
    this.selectedRegion = ''
    this.apiKey = ''
    this.selectedModel = ''
    this.error = null
    this.success = false
    const models = this.modelsByProvider[provider]
    if (models?.length) {
      this.selectedModel = models[0].id
    }
    const hint = this.getHint(provider)
    if (hint.regions?.length) {
      this.selectedRegion = hint.regions[0].id
    }
  }

  private async save() {
    if (!this.selectedProvider) return
    const hint = this.getHint(this.selectedProvider)
    const isLocal = ['ollama', 'vllm', 'sglang'].includes(this.selectedProvider)

    if (!isLocal && !this.apiKey.trim()) {
      this.error = 'API key is required'
      return
    }

    this.saving = true
    this.error = null
    this.success = false

    try {
      // Build config patch
      const patch: Record<string, any> = {}

      // Set auth profile (skip for local providers)
      if (!isLocal && this.apiKey.trim()) {
        patch.auth = {
          profiles: {
            [`${this.selectedProvider}:default`]: {
              provider: this.selectedProvider,
              mode: 'api_key',
              apiKey: this.apiKey.trim(),
            },
          },
        }
      }

      // Set default model if selected
      if (this.selectedModel) {
        patch.agents = {
          defaults: {
            model: {
              primary: `${this.selectedProvider}/${this.selectedModel}`,
            },
          },
        }
      }

      // Get baseHash for config.patch
      const config = await this.gateway.call<{ hash?: string }>('config.get')
      const baseHash = config?.hash ?? ''

      await this.gateway.call('config.patch', {
        baseHash,
        raw: JSON.stringify(patch),
      })

      this.success = true
      this.dispatchEvent(new CustomEvent('provider-saved', { bubbles: true, composed: true }))
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.saving = false
    }
  }

  override render() {
    if (this.loading) {
      return html`<div style="padding:16px; color:var(--muted);">Loading providers...</div>`
    }

    return html`
      <div class="provider-form">
        ${this.success ? html`
          <div class="provider-form__success">
            ✓ Provider configured successfully
          </div>
        ` : nothing}

        ${this.error ? html`
          <div class="provider-form__error">${this.error}</div>
        ` : nothing}

        <!-- Provider selection -->
        <div class="provider-form__field">
          <label class="provider-form__label">Provider</label>
          <div class="provider-form__options">
            ${this.providers.map(p => html`
              <button
                class="provider-form__option ${this.selectedProvider === p ? 'provider-form__option--active' : ''}"
                @click=${() => this.selectProvider(p)}
              >${this.getHint(p).label}</button>
            `)}
          </div>
        </div>

        ${this.selectedProvider ? this._renderProviderConfig() : nothing}
      </div>
    `
  }

  private _renderProviderConfig() {
    const hint = this.getHint(this.selectedProvider)
    const isLocal = ['ollama', 'vllm', 'sglang'].includes(this.selectedProvider)
    const models = this.modelsByProvider[this.selectedProvider] ?? []

    return html`
      <!-- Region (if available) -->
      ${hint.regions?.length ? html`
        <div class="provider-form__field">
          <label class="provider-form__label">Region</label>
          <div class="provider-form__options">
            ${hint.regions.map(r => html`
              <button
                class="provider-form__option ${this.selectedRegion === r.id ? 'provider-form__option--active' : ''}"
                @click=${() => { this.selectedRegion = r.id }}
              >${r.label}</button>
            `)}
          </div>
        </div>
      ` : nothing}

      <!-- API Key -->
      ${!isLocal ? html`
        <div class="provider-form__field">
          <label class="provider-form__label">
            API Key
            ${hint.apiKeyUrl ? html`
              <a href=${hint.apiKeyUrl} target="_blank" rel="noopener" class="provider-form__link">Get key →</a>
            ` : nothing}
          </label>
          <input
            type="password"
            class="provider-form__input"
            placeholder=${hint.apiKeyPlaceholder ?? 'API key'}
            .value=${this.apiKey}
            @input=${(e: Event) => { this.apiKey = (e.target as HTMLInputElement).value }}
          />
        </div>
      ` : nothing}

      <!-- Model selection -->
      ${models.length ? html`
        <div class="provider-form__field">
          <label class="provider-form__label">Model</label>
          <select
            class="provider-form__select"
            .value=${this.selectedModel}
            @change=${(e: Event) => { this.selectedModel = (e.target as HTMLSelectElement).value }}
          >
            ${models.map(m => html`
              <option value=${m.id} ?selected=${m.id === this.selectedModel}>${m.name || m.id}</option>
            `)}
          </select>
        </div>
      ` : nothing}

      <!-- Save -->
      <div class="provider-form__actions">
        <button
          class="provider-form__save"
          @click=${this.save}
          ?disabled=${this.saving}
        >${this.saving ? 'Saving...' : 'Save'}</button>
      </div>
    `
  }
}
