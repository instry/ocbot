import { useEffect, useMemo } from 'react'
import { Smartphone } from 'lucide-react'
import { useChannelStore } from '@/stores/channel-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { CHANNEL_PLATFORMS } from '@/types/channel'
import { FeishuChannelSection } from '@/components/channels/feishu-channel-section'
import { GenericChannelPanel } from '@/components/channels/generic-channel-panel'
import { WeixinChannelSection } from '@/components/channels/weixin-channel-section'
import { PRIORITY_CHANNELS } from '@/lib/channel-platforms'
import { cn } from '@/lib/utils'

export function ChannelsRoute() {
  const client = useGatewayStore(s => s.client)
  const {
    selectedPlatform,
    setSelectedPlatform,
    configs,
    statuses,
    pairingRequests,
    allowFrom,
    loading,
    error,
    loadConfig,
    saveConfig,
    loadStatuses,
    loadPairingRequests,
    approvePairingCode,
    rejectPairingRequest,
    startQrLogin,
    waitQrLogin,
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
      loadPairingRequests(selectedPlatform)
    }
  }, [selectedPlatform, loadConfig, loadPairingRequests])

  const selectedChannel = CHANNEL_PLATFORMS.find(c => c.id === selectedPlatform)
  const orderedChannels = useMemo(() => {
    const priorityIds = new Set(PRIORITY_CHANNELS)
    const priorityChannels = PRIORITY_CHANNELS
      .map(id => CHANNEL_PLATFORMS.find(channel => channel.id === id))
      .filter((channel): channel is (typeof CHANNEL_PLATFORMS)[number] => Boolean(channel))
    const remainingChannels = CHANNEL_PLATFORMS.filter(channel => !priorityIds.has(channel.id as (typeof PRIORITY_CHANNELS)[number]))
    return [...priorityChannels, ...remainingChannels]
  }, [])

  useEffect(() => {
    if (!selectedPlatform && orderedChannels.length > 0) {
      setSelectedPlatform(orderedChannels[0].id)
    }
  }, [orderedChannels, selectedPlatform, setSelectedPlatform])

  const currentConfig = selectedPlatform ? configs[selectedPlatform] : undefined
  const currentStatus = selectedPlatform ? statuses[selectedPlatform] : undefined
  const currentPairingRequests = selectedPlatform ? pairingRequests[selectedPlatform] ?? [] : []
  const currentAllowFrom = selectedPlatform ? allowFrom[selectedPlatform] ?? [] : []
  const currentErrorMessage = currentStatus?.lastError || error
  const isFeishu = selectedPlatform === 'feishu'
  const isWeixin = selectedPlatform === 'weixin'

  const renderSelectedPanel = () => {
    if (!selectedPlatform) {
      return null
    }

    if (isWeixin) {
      return (
        <WeixinChannelSection
          currentConfig={currentConfig}
          currentStatus={currentStatus}
          loading={loading}
          errorMessage={currentErrorMessage}
          startQrLogin={startQrLogin}
          waitQrLogin={waitQrLogin}
        />
      )
    }

    if (isFeishu) {
      return (
        <FeishuChannelSection
          currentConfig={currentConfig}
          currentPairingRequests={currentPairingRequests}
          currentAllowFrom={currentAllowFrom}
          loading={loading}
          errorMessage={currentErrorMessage}
          loadConfig={loadConfig}
          saveConfig={saveConfig}
          approvePairingCode={approvePairingCode}
          rejectPairingRequest={rejectPairingRequest}
        />
      )
    }

    return <GenericChannelPanel selectedPlatform={selectedPlatform} />
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-bg-subtle flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-strong">Mobile</h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {orderedChannels.map(ch => {
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
              <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-text-strong mb-2">Mobile</h3>
              <p className="text-sm text-muted-foreground">
                Connect your agent to messaging platforms. Select a channel to configure.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 max-w-3xl space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-text-strong">{selectedChannel?.label}</h2>
            </div>

            {renderSelectedPanel()}
          </div>
        )}
      </div>
    </div>
  )
}
