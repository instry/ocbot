import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import { getGatewayClient } from '@/gateway'
import { cn } from '@/lib/utils'
import { SelectionGroup } from '@/components/ui/selection-group'

// --- Static provider configuration ---

interface ProviderHint {
  label: string
  api: string
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

const CURATED_PROVIDER_IDS = [
  'google', 'anthropic', 'openai', 'deepseek',
  'xai', 'qwen', 'moonshot', 'minimax',
  'zai', 'openrouter', 'mistral', 'ollama',
]

const LOCAL_PROVIDERS = ['ollama', 'vllm', 'sglang']

export interface ConfiguredProvider {
  profileKey: string
  provider: string
  label: string
  apiKey: string
  baseUrl?: string
  modelId?: string
  isDefault: boolean
}

interface ProviderFormProps {
  editProfileKey?: string | null
  editData?: ConfiguredProvider | null
  onSaved: () => void
  onCancel: () => void
}

export function ProviderForm({ editProfileKey, editData, onSaved, onCancel }: ProviderFormProps) {
  const isEditMode = !!editProfileKey
  const preferredRegion = navigator.language.startsWith('zh') ? 'cn' : 'global'

  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [selectedModel, setSelectedModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLocal = LOCAL_PROVIDERS.includes(selectedProvider)
  const hint = PROVIDER_HINTS[selectedProvider] ?? { label: selectedProvider, api: '', defaultBaseUrl: '' }
  const models = Array.isArray(hint.models) ? [...hint.models].reverse() : []

  // Populate form in edit mode
  useEffect(() => {
    if (!editData) return
    setSelectedProvider(editData.provider)
    setApiKey(editData.apiKey ?? '')
    setBaseUrl(editData.baseUrl ?? '')
    setSelectedModel(editData.modelId ?? '')
    setSelectedModels(new Set())
    setError(null)

    const h = PROVIDER_HINTS[editData.provider]
    if (h?.regions?.length) {
      const matched = h.regions.find(r => r.baseUrl === editData.baseUrl)
      setSelectedRegion(matched?.id ?? preferredRegion)
    }
  }, [editData])

  function selectProvider(provider: string) {
    if (isEditMode) return
    setSelectedProvider(provider)
    setApiKey('')
    setBaseUrl('')
    setError(null)
    setSelectedModels(new Set())
    setSelectedModel('')

    const h = PROVIDER_HINTS[provider]
    if (h?.regions?.length) {
      const preferred = h.regions.find(r => r.id === preferredRegion) ?? h.regions[0]
      setSelectedRegion(preferred.id)
      setBaseUrl(preferred.baseUrl)
    } else {
      setSelectedRegion('')
      setBaseUrl(h?.defaultBaseUrl ?? '')
    }

    // Pre-select newest model
    if (h?.models?.length) {
      const newest = h.models[h.models.length - 1]
      setSelectedModels(new Set([newest.id]))
      setSelectedModel(newest.id)
    }
  }

  function handleRegionChange(regionId: string) {
    setSelectedRegion(regionId)
    const region = hint.regions?.find(r => r.id === regionId)
    if (region) setBaseUrl(region.baseUrl)
  }

  function toggleModel(id: string) {
    setSelectedModels(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function save() {
    if (!selectedProvider) return
    if (!isLocal && !apiKey.trim()) {
      setError('API key is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const gw = getGatewayClient()
      const patch: Record<string, any> = {}

      // Provider config
      const providerConfig: Record<string, any> = {
        api: hint.api,
        baseUrl: baseUrl.trim() || hint.defaultBaseUrl,
      }
      if (!isLocal && apiKey.trim()) {
        providerConfig.apiKey = apiKey.trim()
      }

      // Models
      const modelIds = isEditMode
        ? (selectedModel ? [selectedModel] : [])
        : (hint.models?.length
          ? Array.from(selectedModels)
          : [selectedModel.trim()])

      if (modelIds.length) {
        const allModels = [...(hint.models ?? [])].reverse()
        providerConfig.models = modelIds.filter(Boolean).map(id => {
          const m = allModels.find(m => m.id === id)
          return { id, name: m?.name ?? id }
        })
      }

      patch.models = {
        mode: 'merge',
        providers: { [selectedProvider]: providerConfig },
      }

      // Auth profile
      if (!isLocal) {
        const profileKey = editProfileKey ?? `${selectedProvider}:default`
        patch.auth = {
          profiles: {
            [profileKey]: {
              provider: selectedProvider,
              mode: 'api_key',
            },
          },
        }
      }

      // Default model
      if (isEditMode) {
        if (selectedModel) {
          patch.agents = {
            defaults: { model: { primary: `${selectedProvider}/${selectedModel}` } },
          }
        }
      } else {
        const firstModel = hint.models?.length
          ? Array.from(selectedModels)[0]
          : selectedModel.trim()
        if (firstModel) {
          patch.agents = {
            defaults: { model: { primary: `${selectedProvider}/${firstModel}` } },
          }
        }
      }

      const config = await gw.call<{ hash?: string }>('config.get')
      const baseHash = config?.hash ?? ''

      await gw.call('config.patch', {
        baseHash,
        raw: JSON.stringify(patch),
      })

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const canSave = selectedProvider
    && (isLocal || apiKey.trim())
    && (isEditMode || selectedModels.size > 0 || selectedModel.trim())

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Provider grid (add mode only) */}
      {!isEditMode && (
        <div>
          <label className="block text-sm font-medium text-text-strong mb-2">Provider</label>
          <div className="grid grid-cols-4 gap-2">
            {CURATED_PROVIDER_IDS.map(p => {
              const h = PROVIDER_HINTS[p]
              if (!h) return null
              return (
                <button
                  key={p}
                  onClick={() => selectProvider(p)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    selectedProvider === p
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-bg-subtle text-text hover:bg-bg-hover',
                  )}
                >
                  {h.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedProvider && (
        <>
          {/* Region toggle */}
          {hint.regions && hint.regions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-strong mb-2">Region</label>
              <SelectionGroup
                value={selectedRegion}
                size="compact"
                options={[...hint.regions]
                  .sort((a, b) => a.id === preferredRegion ? -1 : b.id === preferredRegion ? 1 : 0)
                  .map(r => ({
                    value: r.id,
                    label: r.label,
                  }))}
                onChange={handleRegionChange}
              />
            </div>
          )}

          {/* API Key */}
          {!isLocal && (
            <div>
              <label className="block text-sm font-medium text-text-strong mb-2">
                <span>API Key</span>
                {hint.apiKeyUrl && (
                  <a
                    href={hint.apiKeyUrl}
                    target="_blank"
                    rel="noopener"
                    className="ml-2 inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80"
                  >
                    Get key <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder={hint.apiKeyPlaceholder ?? 'Enter API key'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>
          )}

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Base URL</label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="https://..."
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
            />
          </div>

          {/* Model selection */}
          <div>
            <label className="block text-sm font-medium text-text-strong mb-2">
              {!isEditMode && models.length > 1 ? 'Models' : 'Model'}
            </label>
            {models.length > 0 ? (
              isEditMode ? (
                // Edit mode: single select grid
                <div className="grid grid-cols-3 gap-2">
                  {models.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        selectedModel === m.id
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-bg-subtle text-text hover:bg-bg-hover',
                      )}
                    >
                      {m.name || m.id}
                    </button>
                  ))}
                </div>
              ) : (
                // Add mode: multi-select chips
                <div className="flex flex-wrap gap-2">
                  {models.map(m => {
                    const selected = selectedModels.has(m.id)
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleModel(m.id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                          selected
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border bg-bg-subtle text-text hover:bg-bg-hover',
                        )}
                      >
                        <span className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border text-xs',
                          selected
                            ? 'border-accent bg-accent text-white'
                            : 'border-border',
                        )}>
                          {selected && '✓'}
                        </span>
                        {m.name || m.id}
                      </button>
                    )
                  })}
                </div>
              )
            ) : (
              // Free text input for providers without catalog
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="e.g. gpt-4o"
                value={isEditMode ? selectedModel : (selectedModels.size ? Array.from(selectedModels)[0] : '')}
                onChange={e => {
                  const val = e.target.value
                  if (isEditMode) setSelectedModel(val)
                  else setSelectedModels(new Set([val]))
                }}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onCancel}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !canSave}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                canSave && !saving
                  ? 'bg-accent text-white hover:bg-accent/90'
                  : 'bg-accent/30 text-white/50 cursor-not-allowed',
              )}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
