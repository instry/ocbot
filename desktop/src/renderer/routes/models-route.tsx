import { useState, useEffect } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { getGatewayClient } from '@/gateway'
import { ProviderForm, type ConfiguredProvider } from '@/components/models/provider-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useModelStore } from '@/stores/model-store'
import { cn } from '@/lib/utils'

type ModelsView = 'list' | 'add' | 'edit'

export function ModelsRoute() {
  const [view, setView] = useState<ModelsView>('list')
  const [providers, setProviders] = useState<ConfiguredProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [editingProvider, setEditingProvider] = useState<ConfiguredProvider | null>(null)

  const refreshModels = useModelStore(s => s.setModels)

  useEffect(() => {
    loadProviders()
  }, [])

  async function loadProviders() {
    setLoading(true)
    try {
      const gw = getGatewayClient()
      const result = await gw.call<{ config?: Record<string, any>; hash?: string }>('config.get')
      const config = result?.config ?? {}
      const profiles: Record<string, any> = config?.auth?.profiles ?? {}
      const defaultModel: string = config?.agents?.defaults?.model?.primary ?? ''

      const list: ConfiguredProvider[] = []
      for (const [key, profile] of Object.entries(profiles)) {
        const provider = profile.provider ?? key.split(':')[0] ?? ''
        const hint = getProviderLabel(provider)
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
      setProviders(list)

      // Refresh model store
      const models = await gw.call<any[]>('models.list')
      refreshModels(models ?? [])
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
    if (!confirm(`Delete "${profileKey}"?`)) return

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

  function handleSaved() {
    setView('list')
    setEditingProvider(null)
    loadProviders()
  }

  function handleCancel() {
    setView('list')
    setEditingProvider(null)
  }

  if (view === 'add') {
    return (
      <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
        <Button
          onClick={handleCancel}
          variant="ghost"
          className="w-fit px-0 text-muted-foreground hover:border-transparent hover:bg-transparent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Models
        </Button>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-text-strong">Add Provider</h2>
          <p className="text-sm text-muted-foreground">使用统一的表单卡片快速配置模型服务商。</p>
        </div>
        <ProviderForm onSaved={handleSaved} onCancel={handleCancel} />
      </div>
    )
  }

  if (view === 'edit' && editingProvider) {
    return (
      <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
        <Button
          onClick={handleCancel}
          variant="ghost"
          className="w-fit px-0 text-muted-foreground hover:border-transparent hover:bg-transparent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Models
        </Button>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-text-strong">Edit Provider</h2>
          <p className="text-sm text-muted-foreground">{editingProvider.label}</p>
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
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-text-strong">Models</h2>
        <p className="text-sm text-muted-foreground">Manage your AI model providers and API keys.</p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <Card className="shadow-none">
            <CardContent className="p-5 text-sm text-muted-foreground">Loading...</CardContent>
          </Card>
        ) : providers.length === 0 ? (
          <Card className="shadow-none">
            <CardContent className="p-5 text-sm text-muted-foreground">No providers configured yet. Add one to get started.</CardContent>
          </Card>
        ) : (
          providers.map(p => {
            const initials = p.label.slice(0, 2).toUpperCase()
            return (
              <Card
                key={p.profileKey}
                className={cn(
                  'bg-bg-subtle/60 shadow-none',
                  p.isDefault ? 'border-accent/30' : 'border-border',
                )}
              >
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-sm font-semibold text-accent">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-text-strong">{p.profileKey}</span>
                        <Badge>{p.label}</Badge>
                        {p.isDefault && <Badge variant="accent">★ Default</Badge>}
                      </div>
                      {p.modelId && (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.modelId}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => { setEditingProvider(p); setView('edit') }}
                      variant="secondary"
                      size="icon"
                      className="text-muted-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => deleteProvider(p.profileKey)}
                      variant="danger"
                      size="icon"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}

        <Card className="border-dashed bg-bg-subtle/50 shadow-none transition-colors hover:border-accent/60">
          <button
          onClick={() => setView('add')}
            className="w-full rounded-2xl px-4 py-4 text-sm font-medium text-muted-foreground transition-colors hover:text-accent"
          >
            + Add Provider
          </button>
        </Card>
      </div>
    </div>
  )
}
