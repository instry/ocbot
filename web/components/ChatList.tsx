import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import type { Conversation } from '@/lib/types'

const PAGE_SIZE = 20

interface ChatListProps {
  conversations: Conversation[]
  activeConversationId?: string
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
}

export function ChatList({
  conversations,
  activeConversationId,
  onSelectChat,
  onDeleteChat,
}: ChatListProps) {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  const visible = sorted.slice(0, displayCount)
  const hasMore = sorted.length > displayCount

  const handleLoadMore = () => {
    setLoadingMore(true)
    setTimeout(() => {
      setDisplayCount(prev => prev + PAGE_SIZE)
      setLoadingMore(false)
    }, 0)
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No conversations yet
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
        History
      </div>
      {visible.map(conv => (
        <div
          key={conv.id}
          className={`group flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted/80 ${
            conv.id === activeConversationId ? 'bg-accent/50' : ''
          }`}
          onClick={() => onSelectChat(conv.id)}
        >
          <div className="min-w-0 flex-1 truncate text-foreground/80">
            {conv.title || 'New Chat'}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDeleteChat(conv.id) }}
            className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Load more'}
        </button>
      )}
    </div>
  )
}
