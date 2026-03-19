import { useState, useEffect, useCallback } from 'react'
import { SquarePen, Puzzle, Settings, Info, Clock, Smartphone } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'

import { BotAvatar } from '@/components/BotAvatar'
import { ChatList } from '@/components/ChatList'
import { getConversations, deleteConversation } from '@/lib/storage'
import type { Conversation } from '@/lib/types'

type Page = 'new-session' | 'skills' | 'mobile' | 'cron' | 'settings' | 'about'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  onSelectConversation: (id: string) => void
}

const bottomNavItems: { id: Page; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'skills', labelKey: 'nav.skills', icon: Puzzle },
  { id: 'mobile', labelKey: 'nav.mobile', icon: Smartphone },
  { id: 'cron', labelKey: 'nav.cron', icon: Clock },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings },
  { id: 'about', labelKey: 'nav.about', icon: Info },
]

export function Sidebar({ activePage, onNavigate, onSelectConversation }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const { t } = useI18n()
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
        <span className="text-base font-semibold text-foreground tracking-tight">{t('app.name')}</span>
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
          {t('nav.newSession')}
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
        {bottomNavItems.map(({ id, labelKey, icon: Icon }) => (
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
            {t(labelKey)}
          </button>
        ))}
      </nav>
    </aside>
  )
}
