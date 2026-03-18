import { useState } from 'react'
import { ExternalLink, Check } from 'lucide-react'
import type { LlmProvider, ProviderType } from '@/lib/llm/types'
import { getProviderTemplates, getTemplateByType, getRegionBaseUrl, getRegionApiKeyUrl } from '@/lib/llm/models'
import { useI18n } from '@/lib/i18n/context'

interface ProviderFormProps {
  initial?: LlmProvider
  onSave: (provider: LlmProvider) => Promise<void>
  onCancel: () => void
  /** Hide the cancel button */
  hideCancel?: boolean
  /** Compact layout for dialog use */
  compact?: boolean
}

export function ProviderForm({ initial, onSave, onCancel, hideCancel, compact }: ProviderFormProps) {
  const { t, locale } = useI18n()
  const preferredRegion = locale === 'zh' ? 'cn' : 'global'
  const initTemplate = getTemplateByType(initial?.type ?? 'google')
  const [providerType, setProviderType] = useState<ProviderType>(initial?.type ?? 'google')
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? initTemplate?.regions?.find(r => r.id === preferredRegion)?.baseUrl ?? initTemplate?.defaultBaseUrl ?? '')
  const [region, setRegion] = useState<string>(() => {
    if (initial?.baseUrl && initTemplate?.regions) {
      const match = initTemplate.regions.find(r => r.baseUrl === initial.baseUrl)
      if (match) return match.id
    }
    const preferred = initTemplate?.regions?.find(r => r.id === preferredRegion)
    return preferred?.id ?? initTemplate?.regions?.[0]?.id ?? ''
  })
  // For add: multi-select; for edit: single
  const [modelIds, setModelIds] = useState<Set<string>>(() => {
    const id = initial?.modelId ?? initTemplate?.defaultModelId ?? ''
    return id ? new Set([id]) : new Set()
  })
  const [modelId, setModelId] = useState(initial?.modelId ?? initTemplate?.defaultModelId ?? '')
  const [saving, setSaving] = useState(false)

  const template = getTemplateByType(providerType)
  const isCustom = providerType === 'openai-compatible' || providerType === 'local'

  const providerName = region === 'cn' ? `${template?.name ?? providerType}-CN` : (template?.name ?? providerType)

  const handleTypeChange = (type: ProviderType) => {
    setProviderType(type)
    const tmpl = getTemplateByType(type)
    if (!initial) {
      const defaultRegion = tmpl?.regions?.find(r => r.id === preferredRegion) ?? tmpl?.regions?.[0]
      setRegion(defaultRegion?.id ?? '')
      setBaseUrl(defaultRegion?.baseUrl ?? tmpl?.defaultBaseUrl ?? '')
      const defaultId = tmpl?.defaultModelId ?? ''
      setModelIds(defaultId ? new Set([defaultId]) : new Set())
      setModelId(defaultId)
      setApiKey('')
    }
  }

  const handleRegionChange = (regionId: string) => {
    setRegion(regionId)
    const r = template?.regions?.find(r => r.id === regionId)
    if (r) setBaseUrl(r.baseUrl)
  }

  const toggleModel = (id: string) => {
    setModelIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (!apiKey.trim() && !isCustom) return
    setSaving(true)
    try {
      if (initial) {
        // Edit: save single provider
        await onSave({
          id: initial.id,
          type: providerType,
          name: providerName,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
          modelId: modelId.trim(),
          createdAt: initial.createdAt,
          updatedAt: Date.now(),
        })
      } else {
        // Add: create one entry per selected model
        const ids = template && template.models.length > 0
          ? Array.from(modelIds)
          : [modelId.trim()]
        for (const mid of ids) {
          if (!mid) continue
          await onSave({
            id: crypto.randomUUID(),
            type: providerType,
            name: providerName,
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim() || undefined,
            modelId: mid,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const activeApiKeyUrl = template ? getRegionApiKeyUrl(template, region) : undefined

  const gridCols = compact ? 'grid-cols-4' : 'grid-cols-5'

  return (
    <div className="space-y-5">
      {/* Provider Type */}
      {!initial && (
        <fieldset>
          <label className="mb-2 block text-sm font-medium">{t('provider.provider')}</label>
          <div className={`grid ${gridCols} gap-2`}>
            {getProviderTemplates().map(t => (
              <button
                key={t.type}
                onClick={() => handleTypeChange(t.type)}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                  providerType === t.type
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'border-border/50 hover:border-border'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* Region Selector — only shown for providers with regional variants */}
      {template?.regions && template.regions.length > 0 && (
        <fieldset>
          <label className="mb-2 block text-sm font-medium">{t('provider.region')}</label>
          <div className="flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-0.5">
            {[...template.regions].sort((a, b) => a.id === preferredRegion ? -1 : b.id === preferredRegion ? 1 : 0).map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleRegionChange(r.id)}
                className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs transition-colors ${
                  region === r.id
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* API Key */}
      <fieldset>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">{t('provider.apiKey')}</label>
          {activeApiKeyUrl && (
            <a
              href={activeApiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t('provider.getKey')} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={template?.apiKeyPlaceholder ?? t('provider.enterApiKey')}
          className="w-full rounded-xl border border-border/50 bg-muted/50 px-4 py-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary"
        />
      </fieldset>

      {/* Base URL */}
      <fieldset>
        <label className="mb-2 block text-sm font-medium text-muted-foreground">{t('provider.baseUrl')}</label>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder={template?.defaultBaseUrl ?? 'https://...'}
          className="w-full rounded-xl border border-border/50 bg-muted/50 px-4 py-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary"
        />
      </fieldset>

      {/* Model Selection */}
      <fieldset>
        <label className="mb-2 block text-sm font-medium">
          {!initial && template && template.models.length > 1 ? t('provider.models') : t('provider.model')}
        </label>
        {template && template.models.length > 0 ? (
          initial ? (
            // Edit mode: single select
            <div className="grid grid-cols-2 gap-2">
              {template.models.map(m => (
                <button
                  key={m.id}
                  onClick={() => setModelId(m.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    modelId === m.id
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border/50 hover:border-border'
                  }`}
                >
                  <span>{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.contextWindow >= 1000000 ? `${(m.contextWindow / 1000000).toFixed(0)}M` : `${(m.contextWindow / 1000).toFixed(0)}k`} ctx</span>
                </button>
              ))}
            </div>
          ) : (
            // Add mode: multi select with checkboxes
            <>
              <div className="flex flex-wrap gap-2">
                {template.models.map(m => {
                  const selected = modelIds.has(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleModel(m.id)}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        selected ? 'border-primary bg-primary/10' : 'border-border/50 hover:border-border'
                      }`}
                    >
                      <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                        selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      }`}>
                        {selected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      <span>{m.name}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )
        ) : (
          <input
            type="text"
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            placeholder={t('provider.modelPlaceholder')}
            className="w-full rounded-xl border border-border/50 bg-muted/50 px-4 py-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary"
          />
        )}
      </fieldset>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {!hideCancel && (
          <button
            onClick={onCancel}
            className="cursor-pointer rounded-xl border border-border/50 px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80"
          >
            {t('common.cancel')}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={saving || (!apiKey.trim() && !isCustom) || (!initial && template && template.models.length > 0 && modelIds.size === 0)}
          className="cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
