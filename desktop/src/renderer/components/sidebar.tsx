import { useNavigate } from 'react-router'
import {
  MessageSquare,
  List,
  Settings,
  Sun,
  Moon,
  Zap,
  Clock,
  Cpu,
  Radio,
} from 'lucide-react'
import { useUIStore, type Tab } from '@/stores/ui-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { cn } from '@/lib/utils'

interface NavItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  tab: Tab
}

const NAV_GROUPS: NavItem[][] = [
  [
    { icon: MessageSquare, label: 'Chat', tab: 'chat' },
  ],
  [
    { icon: Zap, label: 'Skills', tab: 'skills' },
    { icon: Clock, label: 'Cron', tab: 'cron' },
  ],
  [
    { icon: Cpu, label: 'Models', tab: 'models' },
    { icon: Radio, label: 'Channels', tab: 'channels' },
  ],
]

export function Sidebar() {
  const navigate = useNavigate()
  const tab = useUIStore(s => s.tab)
  const setTab = useUIStore(s => s.setTab)
  const themeMode = useUIStore(s => s.themeMode)
  const toggleThemeMode = useUIStore(s => s.toggleThemeMode)
  const toggleSessionPanel = useUIStore(s => s.toggleSessionPanel)
  const gatewayStatus = useGatewayStore(s => s.status)

  const handleNav = (item: NavItem) => {
    if (item.tab === 'chat') {
      if (tab === 'chat') {
        toggleSessionPanel()
      } else {
        setTab('chat')
        navigate('/')
      }
    } else if (item.tab === 'models') {
      setTab('models')
      navigate('/models')
    } else if (item.tab === 'channels') {
      setTab('channels')
      navigate('/channels')
    } else if (item.tab === 'skills') {
      setTab('skills')
      navigate('/skills')
    } else {
      setTab(item.tab)
    }
  }

  const statusDotColor = gatewayStatus === 'connected'
    ? 'bg-ok'
    : gatewayStatus === 'connecting'
      ? 'bg-warn'
      : 'bg-destructive'

  return (
    <aside className="flex h-full w-[var(--sidebar-width)] flex-col border-r border-border bg-panel pt-[var(--titlebar-height)]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <img src="./logo.png" alt="" className="h-6 w-6 rounded" />
        <span className="text-sm font-semibold text-text-strong">Ocbot</span>
        <span className={cn('ml-auto h-2 w-2 rounded-full', statusDotColor)} />
      </div>

      {/* Navigation */}
      <nav className="no-drag flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div className="my-1.5 mx-2 h-px bg-border" />}
            {group.map(item => {
              const Icon = item.icon
              const isActive = tab === item.tab
              return (
                <button
                  key={item.tab}
                  onClick={() => handleNav(item)}
                  className={cn(
                    'relative flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                    'hover:bg-bg-hover',
                    isActive && 'bg-accent-subtle text-accent',
                    !isActive && 'text-muted-foreground',
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-accent" />
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
        {/* Settings */}
        <button
          onClick={() => { setTab('settings'); navigate('/settings') }}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
            'hover:bg-bg-hover',
            tab === 'settings' ? 'text-accent bg-accent-subtle' : 'text-muted-foreground',
          )}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>

        {/* Version */}
        <div className="px-3 pt-1 text-[11px] text-muted-foreground/50">
          v{typeof __OCBOT_VERSION__ !== 'undefined' ? __OCBOT_VERSION__ : '0.1.0'}
        </div>
      </div>
    </aside>
  )
}
