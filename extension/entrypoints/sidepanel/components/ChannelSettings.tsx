import { useState, useEffect } from 'react'
import { Plus, Trash2, Power, PowerOff } from 'lucide-react'
import type { ChannelConfig, ChannelStatus } from '../../../lib/channels/types'
import { getChannelConfigs, saveChannelConfig, deleteChannelConfig } from '../../../lib/storage'

interface ChannelSettingsProps {
  channelStatuses: Record<string, ChannelStatus>
  onRefreshStatuses: () => void
}

export function ChannelSettings({ channelStatuses, onRefreshStatuses }: ChannelSettingsProps) {
  const [configs, setConfigs] = useState<ChannelConfig[]>([])
  const [editing, setEditing] = useState<ChannelConfig | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    getChannelConfigs().then(setConfigs)
  }, [])

  const handleSave = async (config: ChannelConfig) => {
    await saveChannelConfig(config)
    setConfigs(await getChannelConfigs())
    setShowForm(false)
    setEditing(null)

    // Start or stop based on enabled state
    if (config.enabled && config.botToken) {
      await chrome.runtime.sendMessage({ type: 'startChannel', config })
    } else {
      await chrome.runtime.sendMessage({ type: 'stopChannel', channelId: config.id })
    }
    onRefreshStatuses()
  }

  const handleDelete = async (id: string) => {
    await chrome.runtime.sendMessage({ type: 'stopChannel', channelId: id })
    await deleteChannelConfig(id)
    setConfigs(await getChannelConfigs())
    onRefreshStatuses()
  }

  const handleToggle = async (config: ChannelConfig) => {
    const updated = { ...config, enabled: !config.enabled, updatedAt: Date.now() }
    await handleSave(updated)
  }

  const statusColor = (id: string): string => {
    const s = channelStatuses[id]
    switch (s) {
      case 'connected': return 'bg-green-500'
      case 'connecting': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-zinc-400'
    }
  }

  const statusLabel = (id: string): string => {
    return channelStatuses[id] ?? 'disconnected'
  }

  if (showForm || editing) {
    return (
      <TelegramForm
        initial={editing ?? undefined}
        onSave={handleSave}
        onCancel={() => { setShowForm(false); setEditing(null) }}
      />
    )
  }

  return (
    <div className="space-y-3">
      {configs.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">
          No remote channels configured yet. Add one to chat with your agent via Telegram.
        </p>
      )}

      {configs.map(c => (
        <div key={c.id} className={`rounded-lg border p-3 ${c.enabled ? 'border-primary/50 bg-primary/5' : 'border-border/50'}`}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Telegram</span>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${statusColor(c.id)}`} />
                  <span className="text-[10px] text-muted-foreground capitalize">{statusLabel(c.id)}</span>
                </div>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {c.botToken ? `Token: ${c.botToken.slice(0, 8)}...` : 'No token set'}
              </p>
              {c.allowedChatIds && c.allowedChatIds.length > 0 && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Allowed chats: {c.allowedChatIds.join(', ')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleToggle(c)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title={c.enabled ? 'Disable' : 'Enable'}
              >
                {c.enabled ? <Power className="h-3.5 w-3.5 text-green-500" /> : <PowerOff className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setEditing(c)}
                className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={() => setShowForm(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/80 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Telegram Bot
      </button>
    </div>
  )
}

// --- Telegram Form ---

function TelegramForm({ initial, onSave, onCancel }: {
  initial?: ChannelConfig
  onSave: (config: ChannelConfig) => Promise<void>
  onCancel: () => void
}) {
  const [botToken, setBotToken] = useState(initial?.botToken ?? '')
  const [allowedChatIds, setAllowedChatIds] = useState(initial?.allowedChatIds?.join(', ') ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const chatIds = allowedChatIds
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      await onSave({
        id: initial?.id ?? crypto.randomUUID(),
        type: 'telegram',
        enabled,
        botToken: botToken.trim(),
        allowedChatIds: chatIds.length > 0 ? chatIds : undefined,
        createdAt: initial?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <label className="mb-1.5 block text-xs font-medium">Bot Token</label>
        <input
          type="password"
          value={botToken}
          onChange={e => setBotToken(e.target.value)}
          placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Get a token from @BotFather on Telegram
        </p>
      </fieldset>

      <fieldset>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Allowed Chat IDs</label>
        <input
          type="text"
          value={allowedChatIds}
          onChange={e => setAllowedChatIds(e.target.value)}
          placeholder="Leave empty to auto-capture first /start sender"
          className="w-full rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Comma-separated. Empty = auto-bind first user who sends /start
        </p>
      </fieldset>

      <fieldset>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="rounded"
          />
          Enable on save
        </label>
      </fieldset>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border/50 py-2 text-xs text-muted-foreground hover:bg-muted/80"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !botToken.trim()}
          className="flex-1 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
        >
          {saving ? 'Saving...' : initial ? 'Update' : 'Add Channel'}
        </button>
      </div>
    </div>
  )
}
