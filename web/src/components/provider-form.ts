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
  aliases?: string[]  // alternative provider IDs in models.list
}

const PROVIDER_HINTS: Record<string, ProviderHint> = {
  google: {
    label: 'Google',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeyPlaceholder: 'AI...',
  },
  anthropic: {
    label: 'Anthropic',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-...',
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
  openai: {
    label: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyPlaceholder: 'sk-...',
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
  zai: {
    label: 'Z-AI (Zhipu)',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    apiKeyPlaceholder: 'API key',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.z.ai/api/paas/v4' },
      { id: 'cn', label: 'China', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    ],
  },
  moonshot: {
    label: 'Kimi',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    apiKeyPlaceholder: 'sk-...',
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.moonshot.ai/v1' },
      { id: 'cn', label: 'China', baseUrl: 'https://api.moonshot.cn/v1' },
    ],
    // models.list may use 'kimi-coding' as provider ID
    aliases: ['kimi-coding'],
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
  ollama: {
    label: 'Local (Ollama)',
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

      // Merge alias provider models into the canonical provider ID
      for (const [id, hint] of Object.entries(PROVIDER_HINTS)) {
        if (!hint.aliases) continue
        for (const alias of hint.aliases) {
          if (byProvider[alias]) {
            if (!byProvider[id]) byProvider[id] = []
            byProvider[id].push(...byProvider[alias])
          }
        }
      }

      this.modelsByProvider = byProvider
      // Only show curated providers (ordered by CURATED_PROVIDER_IDS)
      this.providers = CURATED_PROVIDER_IDS.filter(id => PROVIDER_HINTS[id])
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
    }

    // Pre-select first model in add mode
    const models = this.modelsByProvider[provider]
    if (models?.length) {
      this.selectedModels = new Set([models[0].id])
      this.selectedModel = models[0].id
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
      const profileKey = this.editProfileKey ?? `${this.selectedProvider}:default`

      // Set auth profile
      if (!this.isLocal && this.apiKey.trim()) {
        const profile: Record<string, string> = {
          provider: this.selectedProvider,
          mode: 'api_key',
          apiKey: this.apiKey.trim(),
        }
        if (this.baseUrl.trim()) {
          profile.baseUrl = this.baseUrl.trim()
        }
        patch.auth = {
          profiles: {
            [profileKey]: profile,
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

        <!-- Provider selection (add mode only) -->
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
    const models = this.modelsByProvider[this.selectedProvider] ?? []

    return html`
      <!-- Region selector -->
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

      <!-- API Key -->
      ${!this.isLocal ? html`
        <div class="provider-form__field">
          <label class="provider-form__label">
            API Key
            ${hint.apiKeyUrl ? html`
              <a href=${hint.apiKeyUrl} target="_blank" rel="noopener" class="provider-form__link">Get key &rarr;</a>
            ` : nothing}
          </label>
          <input
            type="password"
            class="provider-form__input"
            placeholder=${hint.apiKeyPlaceholder ?? 'Enter API key'}
            .value=${this.apiKey}
            @input=${(e: Event) => { this.apiKey = (e.target as HTMLInputElement).value }}
          />
        </div>
      ` : nothing}

      <!-- Base URL -->
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

      <!-- Model selection -->
      <div class="provider-form__field">
        <label class="provider-form__label">
          ${!this.isEditMode && models.length > 1 ? 'Models' : 'Model'}
        </label>
        ${models.length > 0 ? (
          this.isEditMode ? html`
            <!-- Edit mode: single select grid -->
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
            <!-- Add mode: multi-select with checkboxes -->
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

      <!-- Actions -->
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
