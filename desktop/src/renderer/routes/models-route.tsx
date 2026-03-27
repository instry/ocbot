import { useState, useEffect } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { getGatewayClient } from '@/gateway'
import { ProviderForm, type ConfiguredProvider } from '@/components/models/provider-form'
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
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-text mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Models
        </button>
        <h2 className="text-xl font-semibold text-text-strong mb-6">Add Provider</h2>
        <ProviderForm onSaved={handleSaved} onCancel={handleCancel} />
      </div>
    )
  }

  if (view === 'edit' && editingProvider) {
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-text mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Models
        </button>
        <h2 className="text-xl font-semibold text-text-strong mb-2">Edit Provider</h2>
        <p className="text-sm text-muted-foreground mb-6">{editingProvider.label}</p>
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
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
      <h2 className="text-xl font-semibold text-text-strong mb-2">Models</h2>
      <p className="text-sm text-muted-foreground mb-6">Manage your AI model providers and API keys.</p>

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : providers.length === 0 ? (
          <div className="text-sm text-muted-foreground">No providers configured yet. Add one to get started.</div>
        ) : (
          providers.map(p => {
            const initials = p.label.slice(0, 2).toUpperCase()
            return (
              <div
                key={p.profileKey}
                className={cn(
                  'flex items-center justify-between rounded-lg border bg-bg-subtle p-4',
                  p.isDefault ? 'border-accent/30' : 'border-border',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-sm font-semibold text-accent">
                    {initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-strong">{p.profileKey}</span>
                      <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-muted-foreground">
                        {p.label}
                      </span>
                      {p.isDefault && (
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                          ★ Default
                        </span>
                      )}
                    </div>
                    {p.modelId && (
                      <div className="text-xs text-muted-foreground mt-0.5">{p.modelId}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingProvider(p); setView('edit') }}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-bg-hover hover:text-text transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteProvider(p.profileKey)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })
        )}

        <button
          onClick={() => setView('add')}
          className="w-full rounded-lg border border-dashed border-border bg-bg-subtle px-4 py-3 text-sm font-medium text-muted-foreground hover:border-accent hover:text-accent transition-colors"
        >
          + Add Provider
        </button>
      </div>
    </div>
  )
}
