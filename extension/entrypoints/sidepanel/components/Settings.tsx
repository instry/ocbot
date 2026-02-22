import { useState } from 'react'
import { ArrowLeft, Plus, Trash2, ExternalLink } from 'lucide-react'
import type { LlmProvider, ProviderType } from '../../../lib/llm/types'
import { PROVIDER_TEMPLATES, getTemplateByType } from '../../../lib/llm/models'

interface SettingsProps {
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  onSaveProvider: (provider: LlmProvider) => Promise<void>
  onDeleteProvider: (id: string) => Promise<void>
  onSelectProvider: (id: string) => Promise<void>
  onBack: () => void
}

type SettingsView = 'list' | 'add' | 'edit'

export function Settings({ providers, selectedProvider, onSaveProvider, onDeleteProvider, onSelectProvider, onBack }: SettingsProps) {
  const [view, setView] = useState<SettingsView>('list')
  const [editingProvider, setEditingProvider] = useState<LlmProvider | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <button onClick={view === 'list' ? onBack : () => setView('list')} className="rounded-lg p-1 text-muted-foreground hover:bg-muted/80 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold">
          {view === 'list' ? 'LLM Providers' : view === 'add' ? 'Add Provider' : 'Edit Provider'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {view === 'list' && (
          <ProviderList
            providers={providers}
            selectedProvider={selectedProvider}
            onAdd={() => setView('add')}
            onEdit={(p) => { setEditingProvider(p); setView('edit') }}
            onDelete={onDeleteProvider}
            onSelect={onSelectProvider}
          />
        )}
        {view === 'add' && (
          <ProviderForm
            onSave={async (p) => { await onSaveProvider(p); setView('list') }}
            onCancel={() => setView('list')}
          />
        )}
        {view === 'edit' && editingProvider && (
          <ProviderForm
            initial={editingProvider}
            onSave={async (p) => { await onSaveProvider(p); setView('list') }}
            onCancel={() => setView('list')}
          />
        )}
      </div>
    </div>
  )
}

// --- Provider List ---

function ProviderList({ providers, selectedProvider, onAdd, onEdit, onDelete, onSelect }: {
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  onAdd: () => void
  onEdit: (p: LlmProvider) => void
  onDelete: (id: string) => Promise<void>
  onSelect: (id: string) => Promise<void>
}) {
  return (
    <div className="space-y-3">
      {providers.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">
          No providers configured yet. Add one to get started.
        </p>
      )}

      {providers.map(p => {
        const template = getTemplateByType(p.type)
        const model = template?.models.find(m => m.id === p.modelId)
        const isDefault = p.id === selectedProvider?.id

        return (
          <div key={p.id} className={`rounded-lg border p-3 ${isDefault ? 'border-primary/50 bg-primary/5' : 'border-border/50'}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{p.name}</span>
                  {isDefault && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Default</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {model?.name ?? p.modelId}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!isDefault && (
                  <button
                    onClick={() => onSelect(p.id)}
                    className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => onEdit(p)}
                  className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(p.id)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )
      })}

      <button
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/80 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Provider
      </button>
    </div>
  )
}

// --- Provider Form ---

function ProviderForm({ initial, onSave, onCancel }: {
  initial?: LlmProvider
  onSave: (provider: LlmProvider) => Promise<void>
  onCancel: () => void
}) {
  const initTemplate = getTemplateByType(initial?.type ?? 'openai')
  const [providerType, setProviderType] = useState<ProviderType>(initial?.type ?? 'openai')
  const [name, setName] = useState(initial?.name ?? initTemplate?.name ?? '')
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? initTemplate?.defaultBaseUrl ?? '')
  const [modelId, setModelId] = useState(initial?.modelId ?? initTemplate?.defaultModelId ?? '')
  const [saving, setSaving] = useState(false)

  const template = getTemplateByType(providerType)

  const handleTypeChange = (type: ProviderType) => {
    setProviderType(type)
    const tmpl = getTemplateByType(type)
    if (!initial) {
      setName(tmpl?.name ?? '')
      setBaseUrl(tmpl?.defaultBaseUrl ?? '')
      setModelId(tmpl?.defaultModelId ?? '')
      setApiKey('')
    }
  }

  const handleSubmit = async () => {
    if (!apiKey.trim() && providerType !== 'openai-compatible') return
    setSaving(true)
    try {
      await onSave({
        id: initial?.id ?? crypto.randomUUID(),
        type: providerType,
        name: name.trim() || template?.name || providerType,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        modelId: modelId.trim(),
        createdAt: initial?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Provider Type */}
      {!initial && (
        <fieldset>
          <label className="mb-1.5 block text-xs font-medium">Provider</label>
          <div className="grid grid-cols-2 gap-1.5">
            {PROVIDER_TEMPLATES.map(t => (
              <button
                key={t.type}
                onClick={() => handleTypeChange(t.type)}
                className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
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

      {/* Name */}
      <fieldset>
        <label className="mb-1.5 block text-xs font-medium">Display Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={template?.name}
          className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </fieldset>

      {/* API Key */}
      <fieldset>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium">API Key</label>
          {template?.apiKeyUrl && (
            <a
              href={template.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
            >
              Get key <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={template?.apiKeyPlaceholder ?? 'Enter API key'}
          className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </fieldset>

      {/* Base URL (for openai-compatible or override) */}
      {(providerType === 'openai-compatible' || baseUrl !== template?.defaultBaseUrl) && (
        <fieldset>
          <label className="mb-1.5 block text-xs font-medium">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder={template?.defaultBaseUrl ?? 'https://...'}
            className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </fieldset>
      )}

      {/* Model Selection */}
      <fieldset>
        <label className="mb-1.5 block text-xs font-medium">Model</label>
        {template && template.models.length > 0 ? (
          <div className="space-y-1">
            {template.models.map(m => (
              <button
                key={m.id}
                onClick={() => setModelId(m.id)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  modelId === m.id
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'border-border/50 hover:border-border'
                }`}
              >
                <span>{m.name}</span>
                <span className="text-[10px] text-muted-foreground">{(m.contextWindow / 1000).toFixed(0)}k ctx</span>
              </button>
            ))}
          </div>
        ) : (
          <input
            type="text"
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            placeholder="e.g. llama3.2:latest"
            className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        )}
      </fieldset>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border/50 py-2 text-xs text-muted-foreground hover:bg-muted/80"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || (!apiKey.trim() && providerType !== 'openai-compatible')}
          className="flex-1 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
        >
          {saving ? 'Saving...' : initial ? 'Update' : 'Add Provider'}
        </button>
      </div>
    </div>
  )
}
