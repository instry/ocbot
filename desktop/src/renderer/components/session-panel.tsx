import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { Trash2, Search, X, SquarePen } from 'lucide-react'
import { PrimaryActionButton } from '@/components/ui/primary-action-button'
import { useI18n } from '@/lib/i18n'
import { useChatStore } from '@/stores/chat-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { cn } from '@/lib/utils'
import type { Session } from '@/types/chat'

function sessionTitle(s: Session, fallbackTitle: string): string {
  return s.label || s.displayName || s.derivedTitle || fallbackTitle
}

export function SessionPanel() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const sessions = useChatStore(s => s.sessions)
  const activeSessionKey = useChatStore(s => s.activeSessionKey)
  const setSessions = useChatStore(s => s.setSessions)
  const setActiveSession = useChatStore(s => s.setActiveSession)
  const removeSession = useChatStore(s => s.removeSession)
  const client = useGatewayStore(s => s.client)
  const status = useGatewayStore(s => s.status)

  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const safeSessions = Array.isArray(sessions) ? sessions : []

  // Load sessions on mount and when gateway connects
  useEffect(() => {
    if (!client || status !== 'connected') return

    const loadSessions = async () => {
      setLoading(true)
      try {
        const result = await client.call<{ sessions?: Session[] }>('sessions.list', {
          includeDerivedTitles: true,
          includeLastMessage: true,
        })
        if (Array.isArray(result?.sessions)) {
          const sorted = [...result.sessions].sort(
            (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
          )
          setSessions(sorted)
        } else {
          setSessions([])
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    loadSessions()

    // Subscribe to session changes
    const unsub = client.onEvent((event) => {
      if (event === 'sessions.changed') {
        loadSessions()
      }
    })
    return unsub
  }, [client, status, setSessions])

  const filtered = useMemo(
    () =>
      search
        ? safeSessions.filter(s =>
            sessionTitle(s, t('New Chat')).toLowerCase().includes(search.toLowerCase())
          )
        : safeSessions,
    [safeSessions, search, t]
  )

  const handleNewChat = useCallback(() => {
    const key = `ocbot:${Date.now()}`
    setActiveSession(key)
    navigate(`/chat/${encodeURIComponent(key)}`)
  }, [setActiveSession, navigate])

  const handleSelectSession = useCallback((key: string) => {
    setActiveSession(key)
    navigate(`/chat/${encodeURIComponent(key)}`)
  }, [setActiveSession, navigate])

  const handleDelete = useCallback(async (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!client) return

    // Optimistic removal
    removeSession(key)
    try {
      await client.call('sessions.delete', { key })
    } catch {
      // Revert would need original sessions — for simplicity, we don't revert
    }
  }, [client, removeSession])

  return (
    <aside className="flex h-full w-[var(--session-panel-width)] flex-col border-r border-border bg-panel pt-[var(--titlebar-height)]">
      {/* Header */}
      <div className="no-drag flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('Sessions')}
        </span>
        <button
          onClick={handleNewChat}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-bg-hover hover:text-text"
          title={t('New Chat')}
        >
          <SquarePen className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t('Search...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 w-full rounded-md border border-border bg-bg-muted pl-8 pr-7 text-xs text-text placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-0"
            style={{ outline: 'none', boxShadow: 'none' }}
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-text"
              onClick={() => setSearch('')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* New Chat button */}
      <div className="px-3 pb-2">
        <PrimaryActionButton
          onClick={handleNewChat}
          fullWidth
          className="justify-center"
        >
          {t('New Chat')}
        </PrimaryActionButton>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-1">
        {loading && sessions.length === 0 ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-shimmer rounded-md bg-bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {search ? t('No sessions found') : t('No sessions yet')}
          </div>
        ) : (
          filtered.map(session => (
            <button
              key={session.key}
              onClick={() => handleSelectSession(session.key)}
              className={cn(
                'group relative flex w-full items-center rounded-md px-3 py-2 text-left text-[13px] transition-colors',
                'hover:bg-bg-hover',
                session.key === activeSessionKey && 'bg-accent-subtle text-accent',
                session.key !== activeSessionKey && 'text-text',
              )}
            >
              {session.key === activeSessionKey && (
                <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-accent" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{sessionTitle(session, t('New Chat'))}</div>
                {session.lastMessage && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {session.lastMessage}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => handleDelete(session.key, e)}
                className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
