import { useEffect, useState, type ReactNode } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { getGatewayClient } from '@/gateway'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SelectionGroup } from '@/components/ui/selection-group'
import { cn } from '@/lib/utils'

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
const REDACTED_API_KEY = '__OPENCLAW_REDACTED__'

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

function FieldHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="text-sm font-medium text-text-strong">{title}</div>
      </div>
      {action}
    </div>
  )
}

export function ProviderForm({ editProfileKey, editData, onSaved, onCancel }: ProviderFormProps) {
  const isEditMode = !!editProfileKey
  const preferredRegion = navigator.language.startsWith('zh') ? 'cn' : 'global'

  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState('')
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [selectedModel, setSelectedModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLocal = LOCAL_PROVIDERS.includes(selectedProvider)
  const hint = PROVIDER_HINTS[selectedProvider] ?? { label: selectedProvider, api: '', defaultBaseUrl: '' }
  const models = Array.isArray(hint.models) ? [...hint.models].reverse() : []
  const providerOptions = CURATED_PROVIDER_IDS.map(provider => {
    const providerHint = PROVIDER_HINTS[provider]
    return {
      value: provider,
      label: providerHint.label,
    }
  })

  useEffect(() => {
    if (!editData) return
    const initialApiKey = editData.apiKey ?? ''
    const storedApiKey = Boolean(initialApiKey)
    setSelectedProvider(editData.provider)
    setApiKey(initialApiKey === REDACTED_API_KEY ? '' : initialApiKey)
    setHasStoredApiKey(storedApiKey)
    setBaseUrl(editData.baseUrl ?? '')
    setSelectedModel(editData.modelId ?? '')
    setSelectedModels(new Set())
    setError(null)

    const providerHint = PROVIDER_HINTS[editData.provider]
    if (providerHint?.regions?.length) {
      const matched = providerHint.regions.find(region => region.baseUrl === editData.baseUrl)
      setSelectedRegion(matched?.id ?? preferredRegion)
    }
  }, [editData, preferredRegion])

  function selectProvider(provider: string) {
    if (isEditMode) return
    setSelectedProvider(provider)
    setApiKey('')
    setHasStoredApiKey(false)
    setBaseUrl('')
    setError(null)
    setSelectedModels(new Set())
    setSelectedModel('')

    const providerHint = PROVIDER_HINTS[provider]
    if (providerHint?.regions?.length) {
      const preferred = providerHint.regions.find(region => region.id === preferredRegion) ?? providerHint.regions[0]
      setSelectedRegion(preferred.id)
      setBaseUrl(preferred.baseUrl)
    } else {
      setSelectedRegion('')
      setBaseUrl(providerHint?.defaultBaseUrl ?? '')
    }

    if (providerHint?.models?.length) {
      const newest = providerHint.models[providerHint.models.length - 1]
      setSelectedModels(new Set([newest.id]))
      setSelectedModel(newest.id)
    }
  }

  function handleRegionChange(regionId: string) {
    setSelectedRegion(regionId)
    const region = hint.regions?.find(item => item.id === regionId)
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
    if (!isLocal && !apiKey.trim() && !(isEditMode && hasStoredApiKey)) {
      setError('API key is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const gw = getGatewayClient()
      const patch: Record<string, any> = {}

      const providerConfig: Record<string, any> = {
        api: hint.api,
        baseUrl: baseUrl.trim() || hint.defaultBaseUrl,
      }

      if (!isLocal && apiKey.trim()) {
        providerConfig.apiKey = apiKey.trim()
      }

      const modelIds = isEditMode
        ? (selectedModel ? [selectedModel] : [])
        : (hint.models?.length ? Array.from(selectedModels) : Array.from(selectedModels).filter(Boolean))

      if (modelIds.length) {
        const allModels = [...(hint.models ?? [])].reverse()
        providerConfig.models = modelIds.filter(Boolean).map(id => {
          const model = allModels.find(item => item.id === id)
          return { id, name: model?.name ?? id }
        })
      }

      patch.models = {
        mode: 'merge',
        providers: { [selectedProvider]: providerConfig },
      }

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

      if (isEditMode) {
        if (selectedModel) {
          patch.agents = {
            defaults: { model: { primary: `${selectedProvider}/${selectedModel}` } },
          }
        }
      } else {
        const firstModel = hint.models?.length
          ? Array.from(selectedModels)[0]
          : Array.from(selectedModels).find(Boolean) ?? selectedModel.trim()
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
    && (isLocal || apiKey.trim() || (isEditMode && hasStoredApiKey))
    && (isEditMode || selectedModels.size > 0 || selectedModel.trim())

  return (
    <div className="space-y-5">
      {error ? (
        <Card className="border-destructive/30 bg-destructive/10 shadow-none">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {!isEditMode ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {providerOptions.map(option => {
              const selected = option.value === selectedProvider
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectProvider(option.value)}
                  aria-pressed={selected}
                  className={cn(
                    'flex items-center justify-center rounded-xl border px-3 py-2.5 text-center text-sm font-medium transition-colors',
                    selected
                      ? 'border-button-tonal-border bg-button-tonal text-button-tonal-foreground'
                      : 'border-border bg-card text-text-strong hover:border-border-hover hover:bg-bg-hover',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {selectedProvider ? (
        <>
          <div className="space-y-5">
            {hint.regions?.length ? (
              <div className="space-y-3">
                <FieldHeader title="Region" />
                <SelectionGroup
                  value={selectedRegion}
                  size="compact"
                  className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
                  options={[...hint.regions]
                    .sort((a, b) => a.id === preferredRegion ? -1 : b.id === preferredRegion ? 1 : 0)
                    .map(region => ({
                      value: region.id,
                      label: region.label,
                    }))}
                  onChange={handleRegionChange}
                />
              </div>
            ) : null}

            {!isLocal ? (
              <div className="space-y-3">
                <FieldHeader
                  title="API Key"
                  action={hint.apiKeyUrl ? (
                    <a
                      href={hint.apiKeyUrl}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-xs text-accent no-underline transition-colors hover:text-accent/80"
                    >
                      Get key
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : undefined}
                />
                <Input
                  type="text"
                  placeholder={isEditMode && hasStoredApiKey ? 'Stored API key' : (hint.apiKeyPlaceholder ?? 'Enter API key')}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setHasStoredApiKey(Boolean(editData?.apiKey) && event.target.value.trim() === '')
                  }}
                />
              </div>
            ) : null}

            <div className="space-y-3">
              <FieldHeader title="Base URL" />
              <Input
                type="text"
                placeholder="https://..."
                value={baseUrl}
                onChange={event => setBaseUrl(event.target.value)}
              />
            </div>

            <div className="space-y-4">
              <FieldHeader title={!isEditMode && models.length > 1 ? 'Models' : 'Model'} />
              {models.length > 0 ? (
                isEditMode ? (
                  <SelectionGroup
                    value={selectedModel}
                    onChange={setSelectedModel}
                    size="compact"
                    options={models.map(model => ({
                      value: model.id,
                      label: model.name || model.id,
                    }))}
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {models.map(model => {
                      const selected = selectedModels.has(model.id)
                      return (
                        <Button
                          key={model.id}
                          onClick={() => toggleModel(model.id)}
                          variant={selected ? 'tonal' : 'secondary'}
                          size="sm"
                          className={cn('h-auto rounded-full px-3 py-2', !selected && 'text-text')}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 items-center justify-center rounded-full border',
                              selected
                                ? 'border-button-tonal-border bg-card text-button-tonal-foreground'
                                : 'border-border bg-bg text-transparent',
                            )}
                          >
                            <Check className="h-3 w-3" />
                          </span>
                          {model.name || model.id}
                        </Button>
                      )
                    })}
                  </div>
                )
              ) : (
                <Input
                  type="text"
                  placeholder="e.g. gpt-4o"
                  value={isEditMode ? selectedModel : (selectedModels.size ? Array.from(selectedModels)[0] : '')}
                  onChange={event => {
                    const value = event.target.value
                    if (isEditMode) setSelectedModel(value)
                    else setSelectedModels(new Set([value]))
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-start gap-3 pt-4">
            <Button onClick={onCancel} variant="secondary" size="md" className="w-32">Cancel</Button>
            <Button onClick={save} disabled={saving || !canSave} variant="primary" size="md" className="w-32">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
