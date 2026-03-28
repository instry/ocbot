import { useState, useEffect } from 'react'
import { Radio } from 'lucide-react'
import { useChannelStore } from '@/stores/channel-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { CHANNEL_PLATFORMS } from '@/types/channel'
import { ChannelConfigForm } from '@/components/channels/channel-config-form'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ChannelsRoute() {
  const client = useGatewayStore(s => s.client)
  const {
    selectedPlatform,
    setSelectedPlatform,
    configs,
    statuses,
    loading,
    error,
    loadConfig,
    saveConfig,
    loadStatuses,
    startGateway,
    stopGateway,
  } = useChannelStore()

  useEffect(() => {
    if (!client) return
    loadStatuses()
    const timer = setInterval(loadStatuses, 10000)
    return () => clearInterval(timer)
  }, [client, loadStatuses])

  useEffect(() => {
    if (selectedPlatform) {
      loadConfig(selectedPlatform)
    }
  }, [selectedPlatform, loadConfig])

  const selectedChannel = CHANNEL_PLATFORMS.find(c => c.id === selectedPlatform)
  const currentConfig = selectedPlatform ? configs[selectedPlatform] : undefined
  const currentStatus = selectedPlatform ? statuses[selectedPlatform] : undefined

  const handleStart = async () => {
    if (!selectedPlatform) return
    await startGateway(selectedPlatform)
  }

  const handleStop = async () => {
    if (!selectedPlatform) return
    await stopGateway(selectedPlatform)
  }

  const handleConfigChange = async (config: any) => {
    if (!selectedPlatform) return
    await saveConfig(selectedPlatform, config)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-bg-subtle flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-strong">Channels</h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {CHANNEL_PLATFORMS.map(ch => {
            const status = statuses[ch.id]
            const connected = status?.connected || false
            const active = selectedPlatform === ch.id

            return (
              <button
                key={ch.id}
                onClick={() => setSelectedPlatform(ch.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors mb-1',
                  active ? 'bg-accent/10 text-accent' : 'text-text hover:bg-bg-hover'
                )}
              >
                <span className={cn(
                  'h-2 w-2 rounded-full',
                  connected ? 'bg-ok' : 'bg-muted'
                )} />
                <span className="flex-1 text-left">{ch.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedPlatform ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="text-center max-w-md">
              <Radio className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-text-strong mb-2">Channels</h3>
              <p className="text-sm text-muted-foreground">
                Connect your agent to messaging platforms. Select a channel to configure.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 max-w-3xl space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-text-strong mb-2">{selectedChannel?.label}</h2>
              <p className="text-sm text-muted-foreground">{selectedChannel?.desc}</p>
            </div>

            {/* Status Section */}
            {currentStatus && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-text-strong">Status</h3>
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn(
                    'h-2 w-2 rounded-full',
                    currentStatus.connected ? 'bg-ok' : 'bg-muted'
                  )} />
                  <span className="text-text">{currentStatus.connected ? 'Connected' : 'Disconnected'}</span>
                </div>
                {currentStatus.botInfo && (
                  <div className="text-sm text-muted-foreground">
                    Bot: {currentStatus.botInfo.username || currentStatus.botInfo.name || currentStatus.botInfo.id}
                  </div>
                )}
                {currentStatus.lastError && (
                  <div className="text-xs text-danger">{currentStatus.lastError}</div>
                )}
              </div>
            )}

            {/* Configuration Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-text-strong">Configuration</h3>
              <ChannelConfigForm
                platform={selectedPlatform}
                config={currentConfig}
                onChange={handleConfigChange}
              />
            </div>

            {error && (
              <div className="rounded-md border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="flex items-center justify-start gap-3 pt-4">
              <Button
                onClick={handleStart}
                disabled={loading || currentConfig?.enabled}
                variant="primary"
                size="md"
                className="w-32"
              >
                {loading ? 'Starting...' : 'Start'}
              </Button>
              <Button
                onClick={handleStop}
                disabled={loading || !currentConfig?.enabled}
                variant="secondary"
                size="md"
                className="w-32"
              >
                Stop
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
