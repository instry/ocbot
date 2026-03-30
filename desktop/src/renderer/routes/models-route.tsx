import { useState, useEffect } from 'react'
import { ArrowLeft, Check, Pencil, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { getGatewayClient } from '@/gateway'
import { ProviderForm, type ConfiguredProvider } from '@/components/models/provider-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PrimaryActionButton } from '@/components/ui/primary-action-button'
import { useI18n } from '@/lib/i18n'
import { CN_URLS, useModelStore } from '@/stores/model-store'
import { useSetupStore } from '@/stores/setup-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import type { GatewayModel } from '@/types/chat'

type ModelsView = 'list' | 'add' | 'edit'
type ProviderWithModels = ConfiguredProvider & { models: GatewayModel[] }

export function ModelsRoute() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<ModelsView>('list')
  const [providers, setProviders] = useState<ProviderWithModels[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProvider, setEditingProvider] = useState<ConfiguredProvider | null>(null)
  const [switchingModelKey, setSwitchingModelKey] = useState<string | null>(null)
  const setupStatus = useSetupStore(s => s.status)
  const refreshSetup = useSetupStore(s => s.refresh)
  const setTab = useUIStore(s => s.setTab)

  const refreshModels = useModelStore(s => s.setModels)
  const selectModel = useModelStore(s => s.selectModel)
  const setCnProviders = useModelStore(s => s.setCnProviders)
  const getDisplayName = useModelStore(s => s.getDisplayName)
  const isOnboarding = searchParams.get('onboard') === '1'

  useEffect(() => {
    loadProviders()
  }, [])

  useEffect(() => {
    if (!loading && providers.length === 0 && isOnboarding) {
      setView('add')
    }
  }, [loading, providers.length, isOnboarding])

  async function loadProviders() {
    setLoading(true)
    try {
      const gw = getGatewayClient()
      const [configResult, modelsResult] = await Promise.all([
        gw.call<{ config?: Record<string, any>; hash?: string }>('config.get'),
        gw.call<GatewayModel[] | { models?: GatewayModel[] }>('models.list'),
      ])
      const config = configResult?.config ?? {}
      const profiles: Record<string, any> = config?.auth?.profiles ?? {}
      const providerConfigs: Record<string, {
        apiKey?: string
        baseUrl?: string
        models?: Array<{ id?: string; name?: string }>
      }> = config?.models?.providers ?? {}
      const defaultModel: string = config?.agents?.defaults?.model?.primary ?? ''
      const gatewayModels = Array.isArray(modelsResult)
        ? modelsResult
        : (Array.isArray(modelsResult?.models) ? modelsResult.models : [])
      const cnProviders = new Set<string>()

      const list: ProviderWithModels[] = []
      for (const [key, profile] of Object.entries(profiles)) {
        const provider = profile.provider ?? key.split(':')[0] ?? ''
        const hint = getProviderLabel(provider)
        const providerConfig = providerConfigs[provider]
        const apiKey: string = providerConfig?.apiKey ?? profile.apiKey ?? ''
        const baseUrl: string = providerConfig?.baseUrl ?? profile.baseUrl ?? ''
        const cnUrl = CN_URLS[provider]
        if (cnUrl && baseUrl.startsWith(cnUrl)) {
          cnProviders.add(provider)
        }
        const configuredModels = Array.isArray(providerConfig?.models)
          ? providerConfig.models
            .filter((model): model is { id: string; name?: string } => Boolean(model?.id))
            .map(model => ({
              id: model.id,
              name: model.name ?? model.id,
              provider,
            }))
          : []
        const runtimeModels = gatewayModels.filter(model => model.provider === provider)
        const models = [...configuredModels, ...runtimeModels].filter((model, index, array) => (
          array.findIndex(item => item.provider === model.provider && item.id === model.id) === index
        ))
        list.push({
          profileKey: key,
          provider,
          label: hint,
          apiKey,
          baseUrl,
          modelId: defaultModel.startsWith(`${provider}/`) ? defaultModel.split('/').slice(1).join('/') : undefined,
          isDefault: defaultModel.startsWith(`${provider}/`),
          models,
        })
      }
      setProviders(list)
      setCnProviders(cnProviders)

      refreshModels(gatewayModels)
    } catch {
      setProviders([])
    } finally {
      setLoading(false)
    }
  }

  function getProviderLabel(provider: string): string {
    const labels: Record<string, string> = {
      anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google',
      deepseek: 'DeepSeek', xai: 'xAI', openrouter: 'OpenRouter',
      mistral: 'Mistral', qwen: 'Qwen', moonshot: 'Kimi / Moonshot',
      minimax: 'MiniMax', ollama: 'Ollama', zai: 'Zhipu Z-AI',
    }
    return labels[provider] ?? provider
  }

  async function deleteProvider(profileKey: string) {
    if (!confirm(`${t('Delete')} "${profileKey}"?`)) return

    try {
      const gw = getGatewayClient()
      const result = await gw.call<{ config?: Record<string, any>; hash?: string }>('config.get')
      const config = result?.config ?? {}
      const hash = result?.hash ?? ''
      const provider = profileKey.split(':')[0] ?? ''

      const patch: Record<string, any> = {
        auth: { profiles: { [profileKey]: null } },
      }

      if (provider && config?.models?.providers?.[provider]) {
        patch.models = { providers: { [provider]: null } }
      }

      const defaultModel: string = config?.agents?.defaults?.model?.primary ?? ''
      if (provider && defaultModel.startsWith(`${provider}/`)) {
        patch.agents = { defaults: { model: { primary: '' } } }
      }

      await gw.call('config.patch', {
        baseHash: hash,
        raw: JSON.stringify(patch),
      })

      await loadProviders()
    } catch (err) {
      console.error('Failed to delete provider:', err)
    }
  }

  async function handleSaved() {
    await loadProviders()
    await refreshSetup(getGatewayClient())

    if (isOnboarding) {
      setTab('chat')
      setSearchParams({})
      navigate('/')
      return
    }
    setView('list')
    setEditingProvider(null)
  }

  function handleCancel() {
    setView('list')
    setEditingProvider(null)
  }

  async function setDefaultProvider(provider: ProviderWithModels) {
    if (provider.isDefault) return

    const firstModelId = provider.models[0]?.id ?? provider.modelId
    if (!firstModelId) return

    await setDefaultModel(provider.provider, firstModelId)
  }

  async function setDefaultModel(provider: string, modelId: string) {
    const nextModelKey = `${provider}/${modelId}`
    setSwitchingModelKey(nextModelKey)
    try {
      const gw = getGatewayClient()
      const result = await gw.call<{ hash?: string }>('config.get')
      await gw.call('config.patch', {
        baseHash: result?.hash ?? '',
        raw: JSON.stringify({
          agents: {
            defaults: {
              model: {
                primary: nextModelKey,
              },
            },
          },
        }),
      })
      selectModel(nextModelKey)
      await loadProviders()
    } catch (err) {
      console.error('Failed to switch default model:', err)
    } finally {
      setSwitchingModelKey(null)
    }
  }

  if (view === 'add') {
    return (
      <div className="flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
        {!isOnboarding ? (
          <Button
            onClick={handleCancel}
            variant="ghost"
            className="w-fit px-0 text-muted-foreground hover:border-transparent hover:bg-transparent"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('Back to Models')}
          </Button>
        ) : null}
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-text-strong">
            {isOnboarding ? t('Set Up Your First Provider') : t('Add Provider')}
          </h2>
          {isOnboarding ? (
            <p className="text-sm text-muted-foreground">{t('Add one model provider to finish setup and unlock chat.')}</p>
          ) : null}
        </div>
        <ProviderForm onSaved={handleSaved} onCancel={handleCancel} />
      </div>
    )
  }

  if (view === 'edit' && editingProvider) {
    return (
      <div className="flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
        <Button
          onClick={handleCancel}
          variant="ghost"
          className="w-fit px-0 text-muted-foreground hover:border-transparent hover:bg-transparent"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('Back to Models')}
        </Button>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-text-strong">{t('Edit')}</h2>
        </div>
        <ProviderForm
          editProfileKey={editingProvider.profileKey}
          editData={editingProvider}
          onSaved={handleSaved}
          onCancel={handleCancel}
        />
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-text-strong">{t('Models')}</h2>
        <p className="text-sm text-muted-foreground">{t('Manage your AI model providers and API keys.')}</p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <Card className="shadow-none">
            <CardContent className="p-5 text-sm text-muted-foreground">{t('Loading...')}</CardContent>
          </Card>
        ) : providers.length === 0 ? (
          <Card className="shadow-none">
            <CardContent className="p-5 text-sm text-muted-foreground">{t('No providers configured yet. Add one to get started.')}</CardContent>
          </Card>
        ) : (
          providers.map(p => {
            const initials = p.label.slice(0, 2).toUpperCase()
            const isDefaultProfileKey = p.profileKey === `${p.provider}:default`
            const providerModelKey = `${p.provider}/${p.models[0]?.id ?? p.modelId ?? ''}`
            const isSwitchingProvider = Boolean(providerModelKey && switchingModelKey === providerModelKey)
            return (
              <Card
                key={p.profileKey}
                className={cn(
                  'bg-bg-subtle/60 shadow-none transition-colors',
                  !p.isDefault && 'cursor-pointer hover:border-border-hover hover:bg-bg-hover/50',
                  p.isDefault ? 'border-accent/30' : 'border-border',
                  isSwitchingProvider && 'opacity-60',
                )}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('[data-provider-actions="true"]')) return
                  setDefaultProvider(p)
                }}
                title={p.isDefault ? t('Current default provider') : t('Click to switch provider')}
              >
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-sm font-semibold text-accent">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-text-strong">{p.label}</span>
                        {p.isDefault && <Badge variant="accent">{t('★ Default')}</Badge>}
                      </div>
                      {!isDefaultProfileKey ? (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.profileKey}</div>
                      ) : null}
                      {p.models.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.models.map(model => {
                            const key = `${model.provider}/${model.id}`
                            const isDefaultModel = p.isDefault && p.modelId === model.id
                            return (
                              <div
                                key={key}
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                  isDefaultModel
                                    ? 'border-accent/20 bg-accent-subtle text-accent'
                                    : 'border-border bg-bg text-muted-foreground hover:border-border-hover hover:bg-bg-hover hover:text-text-strong',
                                )}
                              >
                                {isDefaultModel ? <Check className="h-3 w-3" /> : null}
                                <span className="truncate">{getDisplayName(model)}</span>
                              </div>
                            )
                          })}
                        </div>
                      ) : p.modelId ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <div
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                              p.isDefault
                                ? 'border-accent/20 bg-accent-subtle text-accent'
                                : 'border-border bg-bg text-muted-foreground hover:border-border-hover hover:bg-bg-hover hover:text-text-strong',
                            )}
                          >
                            {p.isDefault ? <Check className="h-3 w-3" /> : null}
                            <span className="truncate">{p.modelId}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2" data-provider-actions="true">
                    <Button
                      onClick={() => { setEditingProvider(p); setView('edit') }}
                      variant="secondary"
                      size="icon"
                      className="text-muted-foreground"
                      title={t('Edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => deleteProvider(p.profileKey)}
                      variant="danger"
                      size="icon"
                      title={t('Delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}

        <PrimaryActionButton
          onClick={() => setView('add')}
          fullWidth
          className="justify-center"
        >
          {t('Add')}
        </PrimaryActionButton>
      </div>
    </div>
  )
}
