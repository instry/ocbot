import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { Sidebar } from '@/components/sidebar'
import { SessionPanel } from '@/components/session-panel'
import { Titlebar } from '@/components/titlebar'
import { ConnectionStatus } from '@/components/connection-status'
import { useGateway } from '@/hooks/use-gateway'
import { useTheme } from '@/hooks/use-theme'
import { useI18n } from '@/lib/i18n'
import { useGatewayStore } from '@/stores/gateway-store'
import { useSetupStore } from '@/stores/setup-store'
import { useUIStore } from '@/stores/ui-store'
import { Loader2 } from 'lucide-react'

export function App() {
  const gatewayStatus = useGateway()
  useTheme()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const tab = useUIStore(s => s.tab)
  const setTab = useUIStore(s => s.setTab)
  const sessionPanelOpen = useUIStore(s => s.sessionPanelOpen)
  const client = useGatewayStore(s => s.client)
  const hasConnectedOnce = useGatewayStore(s => s.hasConnectedOnce)
  const setupStatus = useSetupStore(s => s.status)
  const refreshSetup = useSetupStore(s => s.refresh)
  const resetSetup = useSetupStore(s => s.reset)

  useEffect(() => {
    if (gatewayStatus === 'connected' && client) {
      void refreshSetup(client)
      return
    }

    resetSetup()
  }, [gatewayStatus, client, refreshSetup, resetSetup])

  useEffect(() => {
    if (setupStatus !== 'needs_onboarding') {
      return
    }

    if (location.pathname === '/' || location.pathname.startsWith('/chat')) {
      setTab('models')
      navigate('/models?onboard=1', { replace: true })
    }
  }, [setupStatus, location.pathname, navigate, setTab])

  useEffect(() => {
    if (location.pathname === '/' || location.pathname.startsWith('/chat')) {
      setTab('chat')
      return
    }
    if (location.pathname.startsWith('/skills')) {
      setTab('skills')
      return
    }
    if (location.pathname.startsWith('/cron')) {
      setTab('cron')
      return
    }
    if (location.pathname.startsWith('/models')) {
      setTab('models')
      return
    }
    if (location.pathname.startsWith('/channels')) {
      setTab('channels')
      return
    }
    if (location.pathname.startsWith('/browser')) {
      setTab('browser')
      return
    }
    if (location.pathname.startsWith('/settings')) {
      setTab('settings')
    }
  }, [location.pathname, setTab])

  // Connection screen
  if (gatewayStatus !== 'connected' && !hasConnectedOnce) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-linear-to-b from-[#faf7ff] to-[#f3efff]">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-[#e9d5ff] bg-white/90 px-8 py-7 shadow-[0_20px_60px_rgba(124,58,237,0.12)] backdrop-blur-sm animate-fade-in">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
          <span className="text-sm text-[#4c1d95]">
            {gatewayStatus === 'connecting'
              ? t('Connecting to Ocbot...')
              : t('Starting AI runtime')}
          </span>
        </div>
      </div>
    )
  }

  if (setupStatus === 'checking' && (location.pathname === '/' || location.pathname.startsWith('/chat'))) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-linear-to-b from-[#faf7ff] to-[#f3efff]">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-[#e9d5ff] bg-white/90 px-8 py-7 shadow-[0_20px_60px_rgba(124,58,237,0.12)] backdrop-blur-sm animate-fade-in">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
          <span className="text-sm text-[#4c1d95]">{t('Preparing first-time setup...')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      {/* macOS titlebar drag region */}
      <Titlebar />

      {/* Left sidebar */}
      <Sidebar />

      {/* Session panel (conditionally shown) */}
      {tab === 'chat' && sessionPanelOpen && <SessionPanel />}

      <main className="flex flex-1 flex-col overflow-hidden pt-(--titlebar-height)">
        <Outlet />
      </main>

      {/* Connection status indicator */}
      <ConnectionStatus />

      {hasConnectedOnce && gatewayStatus !== 'connected' ? (
        <div className="pointer-events-none absolute inset-x-0 top-(--titlebar-height) z-50 flex justify-center p-3">
          <div className="rounded-full border border-border bg-bg/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            {t('Reconnecting AI runtime…')}
          </div>
        </div>
      ) : null}
    </div>
  )
}
