import { Outlet } from 'react-router'
import { Sidebar } from '@/components/sidebar'
import { SessionPanel } from '@/components/session-panel'
import { Titlebar } from '@/components/titlebar'
import { ConnectionStatus } from '@/components/connection-status'
import { useGateway } from '@/hooks/use-gateway'
import { useTheme } from '@/hooks/use-theme'
import { useUIStore } from '@/stores/ui-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { Loader2 } from 'lucide-react'

export function App() {
  const gatewayStatus = useGateway()
  useTheme()

  const tab = useUIStore(s => s.tab)
  const sessionPanelOpen = useUIStore(s => s.sessionPanelOpen)

  // Connection screen
  if (gatewayStatus !== 'connected') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <span className="text-sm text-muted-foreground">
            {gatewayStatus === 'connecting'
              ? 'Connecting to Ocbot...'
              : 'Starting AI runtime'}
          </span>
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

      {/* Main content area */}
      <main className="flex flex-1 flex-col overflow-hidden pt-[var(--titlebar-height)]">
        {tab === 'chat' || tab === 'settings' ? (
          <Outlet />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <span className="text-lg font-medium text-text-strong">
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </span>
            <span className="text-sm text-muted-foreground">Coming soon</span>
          </div>
        )}
      </main>

      {/* Connection status indicator */}
      <ConnectionStatus />
    </div>
  )
}
