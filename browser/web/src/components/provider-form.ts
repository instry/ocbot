import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

// --- Static provider configuration including model catalogs ---
// Model IDs are maintained here to avoid dependency on gateway models.list,
// which mixes sources (plugins, user config, models.json) and can produce
// incorrect model IDs for a given provider.

interface ProviderHint {
  label: string
  api: string  // OpenClaw API protocol type
  defaultBaseUrl: string
  apiKeyUrl?: string
  apiKeyPlaceholder?: string
  regions?: { id: string; label: string; baseUrl: string }[]
  models?: { id: string; name: string }[]
}

const PROVIDER_HINTS: Record<string, ProviderHint> = {
  google: {
    label: 'Google',
    api: 'google-genai',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeyPlaceholder: 'AI...',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    api: 'anthropic-messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-...',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    ],
  },
  minimax: {
    label: 'MiniMax',
    api: 'anthropic-messages',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    apiKeyPlaceholder: 'API key',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.minimax.io/v1' },
      { id: 'cn', label: 'China', baseUrl: 'https://api.minimaxi.com/v1' },
    ],
    models: [
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5' },
    ],
  },
  openai: {
    label: 'OpenAI',
    api: 'openai-responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      { id: 'o3', name: 'o3' },
      { id: 'o4-mini', name: 'o4 Mini' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    api: 'openai-completions',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    apiKeyPlaceholder: 'sk-...',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
  },
  xai: {
    label: 'xAI',
    api: 'openai-completions',
    defaultBaseUrl: 'https://api.x.ai/v1',
    apiKeyUrl: 'https://console.x.ai/team/default/api-keys',
    apiKeyPlaceholder: 'xai-...',
    models: [
      { id: 'grok-3', name: 'Grok 3' },
      { id: 'grok-3-mini', name: 'Grok 3 Mini' },
    ],
  },
  zai: {
    label: 'Z-AI (Zhipu)',
    api: 'openai-completions',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    apiKeyPlaceholder: 'API key',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.z.ai/api/paas/v4' },
      { id: 'cn', label: 'China', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    ],
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus' },
    ],
  },
  moonshot: {
    label: 'Kimi',
    api: 'openai-completions',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    apiKeyPlaceholder: 'sk-...',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.moonshot.ai/v1' },
      { id: 'cn', label: 'China', baseUrl: 'https://api.moonshot.cn/v1' },
    ],
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5' },
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking' },
      { id: 'kimi-k2-turbo', name: 'Kimi K2 Turbo' },
    ],
  },
  qwen: {
    label: 'Qwen',
    api: 'openai-completions',
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    apiKeyPlaceholder: 'sk-...',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
      { id: 'cn', label: 'China', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    ],
    models: [
      { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus' },
      { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    api: 'openai-completions',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiKeyPlaceholder: 'sk-or-...',
  },
  mistral: {
    label: 'Mistral',
    api: 'openai-completions',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    apiKeyPlaceholder: 'API key',
    models: [
      { id: 'codestral-latest', name: 'Codestral' },
      { id: 'mistral-large-latest', name: 'Mistral Large' },
    ],
  },
  ollama: {
    label: 'Local (Ollama)',
    api: 'openai-completions',
    defaultBaseUrl: 'http://localhost:11434/v1',
    apiKeyPlaceholder: '(not required)',
  },
}

// Curated provider list — ordered by popularity, only show these in the UI
const CURATED_PROVIDER_IDS = [
  'google', 'anthropic', 'openai', 'deepseek',
  'xai', 'qwen', 'moonshot', 'minimax',
  'zai', 'openrouter', 'mistral', 'ollama',
]

interface GatewayModel {
  id: string
  name: string
  provider: string
}

/** Profile stored in openclaw config auth.profiles */
interface AuthProfile {
  provider: string
  mode: string
  apiKey?: string
  baseUrl?: string
}

/** Data representing a configured provider for list display */
export interface ConfiguredProvider {
  profileKey: string
  provider: string
  label: string
  apiKey: string
  baseUrl?: string
  modelId?: string
  isDefault: boolean
}

@customElement('ocbot-provider-form')
export class OcbotProviderForm extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property({ type: Boolean }) inline = false

  /** When set, the form is in edit mode for this profile key */
  @property({ type: String }) editProfileKey: string | null = null

  /** Initial data for edit mode */
  @property({ attribute: false }) editData: ConfiguredProvider | null = null

  @state() providers: string[] = []
  @state() modelsByProvider: Record<string, GatewayModel[]> = {}
  @state() selectedProvider = ''
  @state() selectedRegion = ''
  @state() apiKey = ''
  @state() baseUrl = ''
  @state() selectedModels = new Set<string>()
  @state() selectedModel = ''
  @state() saving = false
  @state() error: string | null = null
  @state() loading = true

  private get isEditMode() { return !!this.editProfileKey }
  private get isLocal() { return ['ollama', 'vllm', 'sglang'].includes(this.selectedProvider) }
  private get preferredRegion() {
    return navigator.language.startsWith('zh') ? 'cn' : 'global'
  }

  override connectedCallback() {
    super.connectedCallback()
    this.loadModels()
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has('editData') && this.editData) {
      this.populateFromEdit(this.editData)
    }
  }

  private populateFromEdit(data: ConfiguredProvider) {
    this.selectedProvider = data.provider
    this.apiKey = data.apiKey ?? ''
    this.baseUrl = data.baseUrl ?? ''
    this.selectedModel = data.modelId ?? ''
    this.selectedModels = new Set()
    this.error = null

    const hint = this.getHint(data.provider)
    if (hint.regions?.length) {
      const matchedRegion = hint.regions.find(r => r.baseUrl === data.baseUrl)
      this.selectedRegion = matchedRegion?.id ?? this.preferredRegion
    } else {
      this.selectedRegion = ''
    }
  }

  private loadModels() {
    const byProvider: Record<string, GatewayModel[]> = {}
    for (const [id, hint] of Object.entries(PROVIDER_HINTS)) {
      if (hint.models?.length) {
        byProvider[id] = hint.models.map(m => ({ ...m, provider: id }))
      }
    }
    this.modelsByProvider = byProvider
    this.providers = CURATED_PROVIDER_IDS.filter(id => PROVIDER_HINTS[id])
    this.loading = false
  }

  private getHint(provider: string): ProviderHint {
    return PROVIDER_HINTS[provider] ?? { label: provider }
  }

  private selectProvider(provider: string) {
    if (this.isEditMode) return
    this.selectedProvider = provider
    this.apiKey = ''
    this.baseUrl = ''
    this.error = null
    this.selectedModels = new Set<string>()
    this.selectedModel = ''

    const hint = this.getHint(provider)
    if (hint.regions?.length) {
      const preferred = hint.regions.find(r => r.id === this.preferredRegion) ?? hint.regions[0]
      this.selectedRegion = preferred.id
      this.baseUrl = preferred.baseUrl
    } else {
      this.selectedRegion = ''
      this.baseUrl = hint.defaultBaseUrl ?? ''
    }

    // Pre-select newest model in add mode
    const models = this.modelsByProvider[provider]
    if (models?.length) {
      const newest = models[models.length - 1]
      this.selectedModels = new Set([newest.id])
      this.selectedModel = newest.id
    }
  }

  private handleRegionChange(regionId: string) {
    this.selectedRegion = regionId
    const hint = this.getHint(this.selectedProvider)
    const region = hint.regions?.find(r => r.id === regionId)
    if (region) this.baseUrl = region.baseUrl
  }

  private toggleModel(id: string) {
    const next = new Set(this.selectedModels)
    if (next.has(id)) {
      if (next.size > 1) next.delete(id)
    } else {
      next.add(id)
    }
    this.selectedModels = next
  }

  private async save() {
    if (!this.selectedProvider) return

    if (!this.isLocal && !this.apiKey.trim()) {
      this.error = 'API key is required'
      return
    }

    this.saving = true
    this.error = null

    try {
      const patch: Record<string, any> = {}
      const hint = this.getHint(this.selectedProvider)

      // Write provider config to models.providers
      const providerConfig: Record<string, any> = {
        api: hint.api,  // Required: tells gateway which protocol to use
        baseUrl: this.baseUrl.trim() || hint.defaultBaseUrl,
      }
      if (!this.isLocal && this.apiKey.trim()) {
        providerConfig.apiKey = this.apiKey.trim()
      }

      // Include selected models in provider config
      const modelIds = this.isEditMode
        ? (this.selectedModel ? [this.selectedModel] : [])
        : (this.modelsByProvider[this.selectedProvider]?.length
            ? Array.from(this.selectedModels)
            : [this.selectedModel.trim()])

      if (modelIds.length) {
        const allModels = [...(this.modelsByProvider[this.selectedProvider] ?? [])].reverse()
        providerConfig.models = modelIds.filter(Boolean).map(id => {
          const m = allModels.find(m => m.id === id)
          return { id, name: m?.name ?? id }
        })
      }

      if (Object.keys(providerConfig).length) {
        patch.models = {
          mode: 'merge',
          providers: {
            [this.selectedProvider]: providerConfig,
          },
        }
      }

      // Also set auth profile (provider + mode only, no secrets)
      if (!this.isLocal) {
        const profileKey = this.editProfileKey ?? `${this.selectedProvider}:default`
        patch.auth = {
          profiles: {
            [profileKey]: {
              provider: this.selectedProvider,
              mode: 'api_key',
            },
          },
        }
      }

      // Set default model
      if (this.isEditMode) {
        if (this.selectedModel) {
          patch.agents = {
            defaults: {
              model: { primary: `${this.selectedProvider}/${this.selectedModel}` },
            },
          }
        }
      } else {
        // Add mode: save for first selected model
        const modelIds = this.modelsByProvider[this.selectedProvider]?.length
          ? Array.from(this.selectedModels)
          : [this.selectedModel.trim()]
        const firstModel = modelIds[0]
        if (firstModel) {
          patch.agents = {
            defaults: {
              model: { primary: `${this.selectedProvider}/${firstModel}` },
            },
          }
        }
      }

      const config = await this.gateway.call<{ hash?: string }>('config.get')
      const baseHash = config?.hash ?? ''

      await this.gateway.call('config.patch', {
        baseHash,
        raw: JSON.stringify(patch),
      })

      this.dispatchEvent(new CustomEvent('provider-saved', { bubbles: true, composed: true }))
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.saving = false
    }
  }

  private cancel() {
    this.dispatchEvent(new CustomEvent('provider-cancel', { bubbles: true, composed: true }))
  }

  override render() {
    if (this.loading) {
      return html`<div class="provider-form__loading">Loading providers...</div>`
    }

    return html`
      <div class="provider-form provider-form--full">
        ${this.error ? html`
          <div class="provider-form__error">${this.error}</div>
        ` : nothing}

        ${!this.isEditMode ? html`
          <div class="provider-form__field">
            <label class="provider-form__label">Provider</label>
            <div class="provider-form__grid">
              ${this.providers.map(p => html`
                <button
                  class="provider-form__grid-btn ${this.selectedProvider === p ? 'provider-form__grid-btn--active' : ''}"
                  @click=${() => this.selectProvider(p)}
                >${this.getHint(p).label}</button>
              `)}
            </div>
          </div>
        ` : nothing}

        ${this.selectedProvider ? this._renderConfig() : nothing}
      </div>
    `
  }

  private _renderConfig() {
    const hint = this.getHint(this.selectedProvider)
    const models = [...(this.modelsByProvider[this.selectedProvider] ?? [])].reverse()

    return html`
      ${hint.regions?.length ? html`
        <div class="provider-form__field">
          <label class="provider-form__label">Region</label>
          <div class="provider-form__toggle-group">
            ${[...hint.regions]
              .sort((a, b) => a.id === this.preferredRegion ? -1 : b.id === this.preferredRegion ? 1 : 0)
              .map(r => html`
              <button
                class="provider-form__toggle-btn ${this.selectedRegion === r.id ? 'provider-form__toggle-btn--active' : ''}"
                @click=${() => this.handleRegionChange(r.id)}
              >${r.label}</button>
            `)}
          </div>
        </div>
      ` : nothing}

      ${!this.isLocal ? html`
        <div class="provider-form__field">
          <label class="provider-form__label">
            API Key
            ${hint.apiKeyUrl ? html`
              <a href=${hint.apiKeyUrl} target="_blank" rel="noopener" class="provider-form__link">Get key &rarr;</a>
            ` : nothing}
          </label>
          <input
            type="text"
            class="provider-form__input"
            placeholder=${hint.apiKeyPlaceholder ?? 'Enter API key'}
            .value=${this.apiKey}
            @input=${(e: Event) => { this.apiKey = (e.target as HTMLInputElement).value }}
          />
        </div>
      ` : nothing}

      <div class="provider-form__field">
        <label class="provider-form__label provider-form__label--muted">Base URL</label>
        <input
          type="text"
          class="provider-form__input"
          placeholder="https://..."
          .value=${this.baseUrl}
          @input=${(e: Event) => { this.baseUrl = (e.target as HTMLInputElement).value }}
        />
      </div>

      <div class="provider-form__field">
        <label class="provider-form__label">
          ${!this.isEditMode && models.length > 1 ? 'Models' : 'Model'}
        </label>
        ${models.length > 0 ? (
          this.isEditMode ? html`
            <div class="provider-form__model-grid">
              ${models.map(m => html`
                <button
                  class="provider-form__model-btn ${this.selectedModel === m.id ? 'provider-form__model-btn--active' : ''}"
                  @click=${() => { this.selectedModel = m.id }}
                >
                  <span class="provider-form__model-name">${m.name || m.id}</span>
                </button>
              `)}
            </div>
          ` : html`
            <div class="provider-form__model-chips">
              ${models.map(m => {
                const selected = this.selectedModels.has(m.id)
                return html`
                  <button
                    class="provider-form__chip ${selected ? 'provider-form__chip--active' : ''}"
                    @click=${() => this.toggleModel(m.id)}
                  >
                    <span class="provider-form__checkbox ${selected ? 'provider-form__checkbox--checked' : ''}">
                      ${selected ? html`<span class="provider-form__checkmark">&#10003;</span>` : nothing}
                    </span>
                    <span>${m.name || m.id}</span>
                  </button>
                `
              })}
            </div>
          `)
        : html`
          <input
            type="text"
            class="provider-form__input"
            placeholder="e.g. gpt-4o"
            .value=${this.isEditMode ? this.selectedModel : (this.selectedModels.size ? Array.from(this.selectedModels)[0] : '')}
            @input=${(e: Event) => {
              const val = (e.target as HTMLInputElement).value
              if (this.isEditMode) { this.selectedModel = val }
              else { this.selectedModels = new Set([val]) }
            }}
          />
        `}
      </div>

      <div class="provider-form__actions">
        <button
          class="provider-form__cancel-btn"
          @click=${() => this.cancel()}
        >Cancel</button>
        <button
          class="provider-form__save"
          @click=${() => this.save()}
          ?disabled=${this.saving || (!this.isLocal && !this.apiKey.trim()) || (!this.isEditMode && this.selectedModels.size === 0 && !this.selectedModel.trim())}
        >${this.saving ? 'Saving...' : 'Save'}</button>
      </div>
    `
  }
}
