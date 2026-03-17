import { useState, useEffect, useCallback } from 'react'
import { SquarePen, Puzzle, Settings, Info } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'

function ClawIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 574 574" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M343.546 83.3483C233.705 92.854 126.99 176.181 64.5414 301.201C36.0403 358.259 25.274 404.118 41.7808 435.067C55.7157 461.193 92.5398 439.124 92.5398 439.124C107.237 433.052 120.009 447.176 128.728 464.641C139.441 486.099 156.388 493.781 186.716 490.928C231.869 486.681 268.534 464.957 285.995 432.106C293.9 417.234 294.975 410.609 292.93 389.39C289.686 355.738 292.189 329.512 301.118 303.596C315.361 262.255 346.23 229.318 392.249 206.362C433.372 185.847 475.985 176.142 525.124 176.1L534.017 176.092L536.938 173.169C542.891 167.211 540.507 161.32 526.765 148.03C478.844 101.688 410.485 77.5547 343.546 83.3483ZM346.123 105.253C299.718 110.043 260.951 124.244 220.472 151.283C154.979 195.03 94.887 274.048 67.5286 352.393C59.2946 375.973 56.7283 397.909 60.3685 413.604C62.8669 424.375 62.9992 424.546 67.0689 422.281C76.5487 417.004 92.8551 414.768 104.276 417.178C116.709 419.802 130.448 428.329 138.621 438.495C140.758 441.153 144.61 447.265 147.18 452.076C155.062 466.833 158.861 468.888 178.162 468.838C192.881 468.8 200.375 467.599 213.675 463.143C242.888 453.357 266.538 431.156 271.052 409.281C271.952 404.92 271.884 401.999 270.626 390.912C264.341 335.53 276.338 286.416 305.524 248.045C333.214 211.637 380.92 181.332 434.941 165.83C455.068 160.053 467.906 157.777 490.25 156.021L502.928 155.026L495.404 149.363C464.816 126.338 432.643 112.649 395.524 106.867C386.859 105.518 353.971 104.443 346.123 105.253ZM492.372 206.689C491.062 207.4 487.824 211.35 485.175 215.468C458.019 257.693 419.035 282.957 368.89 290.828C364.401 291.533 356.476 292.529 351.278 293.043C335.224 294.628 328.576 296.972 318.385 304.639C312.721 308.9 306.492 316.803 303.549 323.462C301.005 329.218 299.533 338.228 298.898 351.932C297.545 381.133 295.706 408.462 294.582 416.096C292.053 433.274 296.474 436.866 315.687 433.243C367.435 423.483 413.692 400.983 450.581 367.629C483.302 338.042 503.753 300.778 509.454 260.358C511.007 249.348 510.682 218.829 508.948 212.906C507.001 206.255 498.823 203.188 492.372 206.689ZM484.015 254.115C471.186 269.678 448.89 286.245 427.312 296.251C406.294 305.996 389.146 310.569 357.614 314.836C340.717 317.121 335.283 318.986 329.945 324.327C323.142 331.138 322.048 335.865 320.776 363.97C319.766 386.278 318.383 406.22 317.691 408.468C317.103 410.372 316.921 410.385 327.652 407.783C376.263 395.999 423.001 367.848 452.319 332.696C470.64 310.727 480.521 290.545 486.178 263.535C489.182 249.187 488.942 248.138 484.015 254.115Z" />
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

const bottomNavItems: { id: Page; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'skills', labelKey: 'nav.skills', icon: Puzzle },
  { id: 'claw', labelKey: 'nav.claw', icon: ClawIcon },
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
