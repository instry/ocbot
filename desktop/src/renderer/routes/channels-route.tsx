import { useState, useEffect } from 'react'
import { Radio, ChevronRight, Loader2 } from 'lucide-react'
import { useGatewayStore } from '@/stores/gateway-store'
import { cn } from '@/lib/utils'

interface ChannelAccount {
  accountId: string
  name?: string
  enabled?: boolean
  configured?: boolean
  connected?: boolean
  running?: boolean
  lastError?: string
}

interface ChannelsStatus {
  channels?: Record<string, { configured?: boolean }>
  channelAccounts?: Record<string, ChannelAccount[]>
}

const CHANNELS = [
  { id: 'feishu', label: 'Feishu', desc: 'Feishu/Lark messaging' },
  { id: 'telegram', label: 'Telegram', desc: 'Telegram bot' },
  { id: 'discord', label: 'Discord', desc: 'Discord bot' },
  { id: 'slack', label: 'Slack', desc: 'Slack bot' },
  { id: 'whatsapp', label: 'WhatsApp', desc: 'WhatsApp messaging' },
]

export function ChannelsRoute() {
  const client = useGatewayStore(s => s.client)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<ChannelsStatus>({})
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return

    const load = async () => {
      try {
        const result = await client.call('channels.status') as ChannelsStatus
        setStatus(result || {})
      } catch (err) {
        console.error('Failed to load channels:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [client])

  const isConfigured = (id: string) => status.channels?.[id]?.configured === true
  const isConnected = (id: string) => {
    const accounts = status.channelAccounts?.[id] || []
    return accounts.some(a => a.connected || a.running)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-bg-subtle flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-strong">Channels</h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {CHANNELS.map(ch => {
            const configured = isConfigured(ch.id)
            const connected = isConnected(ch.id)
            const active = selected === ch.id

            return (
              <button
                key={ch.id}
                onClick={() => setSelected(ch.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors mb-1',
                  active ? 'bg-accent/10 text-accent' : 'text-text hover:bg-bg-hover'
                )}
              >
                <span className={cn(
                  'h-2 w-2 rounded-full',
                  connected ? 'bg-ok' : configured ? 'bg-warn' : 'bg-muted'
                )} />
                <span className="flex-1 text-left">{ch.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selected ? (
          <ChannelDetail channelId={selected} status={status} />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <div className="text-center max-w-md">
              <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-text-strong mb-2">Channels</h3>
              <p className="text-sm text-muted-foreground">
                Connect your agent to messaging platforms. Select a channel to configure.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ChannelDetail({ channelId, status }: { channelId: string; status: ChannelsStatus }) {
  const channel = CHANNELS.find(c => c.id === channelId)
  const configured = status.channels?.[channelId]?.configured === true
  const accounts = status.channelAccounts?.[channelId] || []
  const connected = accounts.some(a => a.connected || a.running)

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-xl font-semibold text-text-strong mb-2">{channel?.label}</h2>
      <p className="text-sm text-muted-foreground mb-6">{channel?.desc}</p>

      {configured ? (
        <div className="space-y-4">
          <div className="bg-bg-subtle border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-strong">Status</h3>
              <span className={cn(
                'px-2 py-1 rounded text-xs font-medium',
                connected ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
              )}>
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {accounts.map(acc => (
              <div key={acc.accountId} className="text-sm text-text">
                {acc.name || acc.accountId}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-bg-subtle border border-border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            This channel is not configured yet.
          </p>
          <p className="text-xs text-muted-foreground">
            Configure via browser extension or CLI
          </p>
        </div>
      )}
    </div>
  )
}
