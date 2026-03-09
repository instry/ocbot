import { useState, useEffect, useCallback } from 'react'
import { SquarePen, Puzzle, Settings, Info } from 'lucide-react'

function ClawIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Left pincer finger — curves out left then curls inward at tip */}
      <path d="M12 15C7 13 3 8 5 4C6 2 9 1 11 3" />
      {/* Right pincer finger — mirror */}
      <path d="M12 15C17 13 21 8 19 4C18 2 15 1 13 3" />
      {/* Arm */}
      <path d="M12 15V22" />
    </svg>
  )
}

import { BotAvatar } from '@/components/BotAvatar'
import { ChatList } from '@/components/ChatList'
import { getConversations, deleteConversation } from '@/lib/storage'
import type { Conversation } from '@/lib/types'

type Page = 'new-session' | 'skills' | 'claw' | 'settings' | 'about'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  onSelectConversation: (id: string) => void
}

const bottomNavItems: { id: Page; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'claw', label: 'Claw', icon: ClawIcon },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'about', label: 'About', icon: Info },
]

export function Sidebar({ activePage, onNavigate, onSelectConversation }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])

  const refresh = useCallback(async () => {
    const convs = await getConversations()
    setConversations(convs)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Listen for conversation changes from other contexts (sidepanel saves)
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ocbot_conversations) refresh()
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [refresh])

  const handleDelete = async (id: string) => {
    await deleteConversation(id)
    await refresh()
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border/40 bg-muted/30">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-3">
        <BotAvatar size="sm" />
        <span className="text-base font-semibold text-foreground tracking-tight">ocbot</span>
      </div>

      {/* New Session button */}
      <div className="px-2 pb-2">
        <button
          onClick={() => onNavigate('new-session')}
          className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            activePage === 'new-session'
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          <SquarePen className="h-4 w-4" />
          New Session
        </button>
      </div>

      {/* Conversation history */}
      <ChatList
        conversations={conversations}
        onSelectChat={onSelectConversation}
        onDeleteChat={handleDelete}
      />

      {/* Bottom nav */}
      <nav className="space-y-0.5 border-t border-border/40 px-2 py-2">
        {bottomNavItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              activePage === id
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
