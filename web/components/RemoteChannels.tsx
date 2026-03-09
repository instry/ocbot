import { useState, useEffect } from 'react'
import { Send, Plus, Trash2, Pencil, Power, PowerOff, ArrowLeft } from 'lucide-react'
import type { ChannelConfig, ChannelStatus } from '@/lib/channels/types'
import { getChannelConfigs, saveChannelConfig, deleteChannelConfig } from '@/lib/storage'

// --- Types ---

type RemoteTab = 'telegram'
type TelegramView = 'list' | 'add' | 'edit'

interface RemoteChannelsProps {
  channelStatuses: Record<string, ChannelStatus>
  onRefreshStatuses: () => void
}

// --- Main Component ---

export function RemoteChannels({ channelStatuses, onRefreshStatuses }: RemoteChannelsProps) {
  const [activeTab, setActiveTab] = useState<RemoteTab>('telegram')
  const [telegramView, setTelegramView] = useState<TelegramView>('list')
  const [editingChannel, setEditingChannel] = useState<ChannelConfig | null>(null)

  const tabs: { id: RemoteTab; label: string; icon: typeof Send }[] = [
    { id: 'telegram', label: 'Telegram', icon: Send },
  ]

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="flex w-48 shrink-0 flex-col border-r border-border/40 bg-muted/20">
        <div className="flex flex-col gap-1 px-3 pt-6 pb-4">
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Remote</h2>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setTelegramView('list') }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeTab === id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'telegram' && (
          <TelegramTab
            view={telegramView}
            setView={setTelegramView}
            editingChannel={editingChannel}
            setEditingChannel={setEditingChannel}
            channelStatuses={channelStatuses}
            onRefreshStatuses={onRefreshStatuses}
          />
        )}
      </div>
    </div>
  )
}

// --- Telegram Tab ---

function TelegramTab({
  view, setView, editingChannel, setEditingChannel, channelStatuses, onRefreshStatuses,
}: {
  view: TelegramView
  setView: (v: TelegramView) => void
  editingChannel: ChannelConfig | null
  setEditingChannel: (c: ChannelConfig | null) => void
  channelStatuses: Record<string, ChannelStatus>
  onRefreshStatuses: () => void
}) {
  const [configs, setConfigs] = useState<ChannelConfig[]>([])

  useEffect(() => {
    getChannelConfigs().then(setConfigs)
  }, [])

  const handleSave = async (config: ChannelConfig) => {
    await saveChannelConfig(config)
    setConfigs(await getChannelConfigs())
    setView('list')
    setEditingChannel(null)

    if (config.enabled && config.botToken) {
      await chrome.runtime.sendMessage({ type: 'startChannel', config, timestamp: Date.now() })
    } else {
      await chrome.runtime.sendMessage({ type: 'stopChannel', channelId: config.id, timestamp: Date.now() })
    }
    onRefreshStatuses()
  }

  const handleDelete = async (id: string) => {
    await chrome.runtime.sendMessage({ type: 'stopChannel', channelId: id, timestamp: Date.now() })
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

  // Add view
  if (view === 'add') {
    return (
      <div className="flex h-full flex-col px-8 pb-10">
        <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
          <button
            onClick={() => setView('list')}
            className="mb-3 flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Telegram
          </button>
          <h2 className="text-base font-semibold text-foreground">Add Telegram Channel</h2>
        </div>
        <div className="max-w-[640px]">
          <TelegramForm
            onSave={handleSave}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    )
  }

  // Edit view
  if (view === 'edit' && editingChannel) {
    return (
      <div className="flex h-full flex-col px-8 pb-10">
        <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
          <button
            onClick={() => setView('list')}
            className="mb-3 flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Telegram
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-foreground">Edit Channel</h2>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${statusColor(editingChannel.id)}`} />
              <span className="text-xs text-muted-foreground capitalize">{statusLabel(editingChannel.id)}</span>
            </div>
          </div>
        </div>
        <div className="max-w-[640px]">
          <TelegramForm
            initial={editingChannel}
            onSave={handleSave}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="flex h-full flex-col px-8 pb-10">
      <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
        <h2 className="text-base font-semibold text-foreground">Telegram</h2>
        <p className="mt-1 text-sm text-muted-foreground">Connect a Telegram bot to control your agent remotely.</p>
      </div>

      <div className="max-w-[640px] space-y-3">
        {configs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No channels configured yet. Add one to chat with your agent via Telegram.
          </p>
        )}

        {configs.map(c => (
          <div
            key={c.id}
            className={`flex items-center justify-between rounded-xl border p-4 transition-colors ${
              c.enabled
                ? 'border-primary/40 bg-primary/5'
                : 'border-border/40 bg-card'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Telegram</span>
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
                className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                title={c.enabled ? 'Disable' : 'Enable'}
              >
                {c.enabled ? <Power className="h-3.5 w-3.5 text-green-600" /> : <PowerOff className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => { setEditingChannel(c); setView('edit') }}
                className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => setView('add')}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Channel
        </button>
      </div>
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
    <div className="space-y-5">
      <fieldset>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Bot Token</label>
        <input
          type="password"
          value={botToken}
          onChange={e => setBotToken(e.target.value)}
          placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          className="w-full rounded-xl border border-border/50 bg-muted/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Get a token from @BotFather on Telegram
        </p>
      </fieldset>

      <fieldset>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Allowed Chat IDs</label>
        <input
          type="text"
          value={allowedChatIds}
          onChange={e => setAllowedChatIds(e.target.value)}
          placeholder="Leave empty to auto-capture first /start sender"
          className="w-full rounded-xl border border-border/50 bg-muted/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Comma-separated. Empty = auto-bind first user who sends /start
        </p>
      </fieldset>

      <fieldset>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="rounded"
          />
          Enable on save
        </label>
      </fieldset>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 cursor-pointer rounded-xl border border-border/50 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/80"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !botToken.trim()}
          className="flex-1 cursor-pointer rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : initial ? 'Update' : 'Add Channel'}
        </button>
      </div>
    </div>
  )
}
