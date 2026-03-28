import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, Check, Search, Plus } from 'lucide-react'
import { useModelStore, CN_URLS } from '@/stores/model-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { cn } from '@/lib/utils'
import type { GatewayModel } from '@/types/chat'

export function ModelPicker() {
  const models = useModelStore(s => s.models)
  const selectedModel = useModelStore(s => s.selectedModel)
  const selectModel = useModelStore(s => s.selectModel)
  const setModels = useModelStore(s => s.setModels)
  const setCnProviders = useModelStore(s => s.setCnProviders)
  const getSelectedDisplay = useModelStore(s => s.getSelectedDisplay)
  const getDisplayName = useModelStore(s => s.getDisplayName)
  const getProviderLabel = useModelStore(s => s.getProviderLabel)

  const client = useGatewayStore(s => s.client)
  const status = useGatewayStore(s => s.status)

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const safeModels = Array.isArray(models) ? models : []

  // Load models on mount
  useEffect(() => {
    if (!client || status !== 'connected') return

    const load = async () => {
      try {
        const [modelsResult, configResult] = await Promise.all([
          client.call<{ models?: GatewayModel[] }>('models.list'),
          client.call<{ config?: Record<string, any> }>('config.get'),
        ])
        const config = configResult?.config ?? {}
        const profiles: Record<string, any> = config?.auth?.profiles ?? {}
        const configuredProviders = new Set<string>()
        const cn = new Set<string>()
        for (const [key, profile] of Object.entries(profiles)) {
          const provider = (profile as any).provider ?? key.split(':')[0]
          configuredProviders.add(provider)
          const baseUrl: string = (profile as any).baseUrl ?? ''
          const cnUrl = CN_URLS[provider]
          if (cnUrl && baseUrl.startsWith(cnUrl)) {
            cn.add(provider)
          }
        }
        setCnProviders(cn)
        const allModels = Array.isArray(modelsResult?.models) ? modelsResult.models : []
        setModels(allModels.filter(m => configuredProviders.has(m.provider)))

        const primary = config?.agents?.defaults?.model?.primary
        if (primary && !selectedModel) {
          selectModel(primary)
        }
      } catch { /* ignore */ }
    }
    load()
  }, [client, status])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Group by provider
  const groups = useMemo(() => {
    const q = search.toLowerCase().trim()
    const result: { provider: string; label: string; items: GatewayModel[] }[] = []
    for (const m of safeModels) {
      const displayName = (m.name || m.id).toLowerCase()
      if (q && !m.provider.toLowerCase().includes(q) && !displayName.includes(q)) continue
      let group = result.find(g => g.provider === m.provider)
      if (!group) {
        group = { provider: m.provider, label: getProviderLabel(m.provider), items: [] }
        result.push(group)
      }
      group.items.push(m)
    }
    return result
  }, [safeModels, search, getProviderLabel])

  if (safeModels.length === 0) return null

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => { setOpen(!open); setSearch('') }}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-bg-hover hover:text-text"
      >
        <span className="max-w-[200px] truncate">{getSelectedDisplay()}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[100] mt-1.5 w-[280px] animate-scale-in rounded-xl border border-border bg-popover shadow-lg">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-text placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-text"
              title="Add model"
              onClick={() => { setOpen(false); window.location.hash = '#/settings' }}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Model list */}
          <div className="max-h-[320px] overflow-y-auto py-1">
            {groups.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                {safeModels.length === 0 ? (
                  <div className="flex flex-col gap-1">
                    <span>No models configured</span>
                    <button
                      className="text-accent hover:underline"
                      onClick={() => { setOpen(false); window.location.hash = '#/settings' }}
                    >
                      Add a model
                    </button>
                  </div>
                ) : (
                  'No models found'
                )}
              </div>
            ) : (
              groups.map(group => (
                <div key={group.provider}>
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map(m => {
                    const key = `${m.provider}/${m.id}`
                    const isSelected = key === selectedModel
                    return (
                      <button
                        key={key}
                        onClick={() => { selectModel(key); setOpen(false) }}
                        className={cn(
                          'flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] transition-colors',
                          'hover:bg-bg-hover',
                          isSelected && 'text-accent',
                          !isSelected && 'text-text',
                        )}
                      >
                        <span className="truncate">{getDisplayName(m)}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
