import { useEffect, useMemo, useState } from 'react'
import { Radio } from 'lucide-react'
import { useChannelStore } from '@/stores/channel-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { CHANNEL_PLATFORMS } from '@/types/channel'
import { ChannelConfigForm } from '@/components/channels/channel-config-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    startGateway,
    stopGateway,
    loadPairingRequests,
    approvePairingCode,
    rejectPairingRequest,
    startQrLogin,
    waitQrLogin,
  } = useChannelStore()
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrMessage, setQrMessage] = useState<string | null>(null)
  const [pairingCodeInput, setPairingCodeInput] = useState('')
  const [pairingActionMessage, setPairingActionMessage] = useState<string | null>(null)
  const [qrWaiting, setQrWaiting] = useState(false)

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

  useEffect(() => {
    setQrDataUrl(null)
    setQrMessage(null)
    setPairingCodeInput('')
    setPairingActionMessage(null)
    setQrWaiting(false)
  }, [selectedPlatform])

  const selectedChannel = CHANNEL_PLATFORMS.find(c => c.id === selectedPlatform)
  const currentConfig = selectedPlatform ? configs[selectedPlatform] : undefined
  const currentStatus = selectedPlatform ? statuses[selectedPlatform] : undefined
  const currentPairingRequests = selectedPlatform ? pairingRequests[selectedPlatform] ?? [] : []
  const currentAllowFrom = selectedPlatform ? allowFrom[selectedPlatform] ?? [] : []
  const supportsQrLogin = selectedPlatform === 'whatsapp' || selectedPlatform === 'weixin'
  const supportsPairing = useMemo(() => {
    if (!selectedPlatform || !currentConfig) return false
    return currentConfig.dmPolicy === 'pairing' || currentConfig.groupPolicy === 'pairing' || currentPairingRequests.length > 0
  }, [currentConfig, currentPairingRequests.length, selectedPlatform])
  const qrLoginDescription = selectedPlatform === 'weixin'
    ? 'Start a WeChat login session and scan the QR code with your mobile WeChat client.'
    : 'Start a WhatsApp web login session and scan the QR code with your phone.'

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

  const handleStartQrLogin = async () => {
    if (!selectedPlatform) return
    setPairingActionMessage(null)
    setQrDataUrl(null)
    const startResult = await startQrLogin(selectedPlatform)
    setQrMessage(startResult.message)
    if (!startResult.qrDataUrl) {
      return
    }

    setQrDataUrl(startResult.qrDataUrl)
    setQrWaiting(true)
    try {
      const waitResult = await waitQrLogin(selectedPlatform, startResult.sessionKey)
      setQrMessage(waitResult.message)
      if (waitResult.connected) {
        setQrDataUrl(null)
      }
    } finally {
      setQrWaiting(false)
    }
  }

  const handleApprovePairing = async (code?: string) => {
    if (!selectedPlatform) return
    const resolvedCode = (code ?? pairingCodeInput).trim().toUpperCase()
    if (!resolvedCode) return
    const approved = await approvePairingCode(selectedPlatform, resolvedCode)
    setPairingActionMessage(approved ? `Approved ${resolvedCode}` : `Unable to approve ${resolvedCode}`)
    if (approved && resolvedCode === pairingCodeInput.trim().toUpperCase()) {
      setPairingCodeInput('')
    }
  }

  const handleRejectPairing = async (code: string) => {
    if (!selectedPlatform) return
    const rejected = await rejectPairingRequest(selectedPlatform, code)
    setPairingActionMessage(rejected ? `Rejected ${code}` : `Unable to reject ${code}`)
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

            {(supportsQrLogin || supportsPairing) && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-text-strong">Auth</h3>

                {supportsQrLogin && (
                  <div className="space-y-3 rounded-lg border border-border bg-bg-subtle p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-text-strong">QR Login</div>
                        <div className="text-xs text-muted-foreground">
                          {qrLoginDescription}
                        </div>
                      </div>
                      <Button
                        onClick={handleStartQrLogin}
                        disabled={loading || qrWaiting}
                        variant="secondary"
                        size="md"
                      >
                        {qrWaiting ? 'Waiting...' : 'Generate QR'}
                      </Button>
                    </div>

                    {qrMessage && (
                      <div className="text-xs text-muted-foreground">{qrMessage}</div>
                    )}

                    {qrDataUrl && (
                      <div className="inline-flex rounded-lg bg-white p-3">
                        <img src={qrDataUrl} alt="QR login" className="h-48 w-48" />
                      </div>
                    )}
                  </div>
                )}

                {supportsPairing && (
                  <div className="space-y-3 rounded-lg border border-border bg-bg-subtle p-4">
                    <div>
                      <div className="text-sm font-medium text-text-strong">Pairing Requests</div>
                      <div className="text-xs text-muted-foreground">
                        Review pending pairing codes and approved sender IDs from the local OpenClaw state.
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Input
                        value={pairingCodeInput}
                        onChange={(event) => setPairingCodeInput(event.target.value.toUpperCase())}
                        placeholder="Enter pairing code"
                      />
                      <Button
                        onClick={() => handleApprovePairing()}
                        disabled={loading || !pairingCodeInput.trim()}
                        variant="secondary"
                        size="md"
                      >
                        Approve
                      </Button>
                    </div>

                    {pairingActionMessage && (
                      <div className="text-xs text-muted-foreground">{pairingActionMessage}</div>
                    )}

                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending</div>
                      {currentPairingRequests.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No pending pairing requests.</div>
                      ) : (
                        currentPairingRequests.map((request) => (
                          <div
                            key={`${request.code}-${request.id}`}
                            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-sm text-text-strong">{request.code}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {request.id} · {new Date(request.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => handleApprovePairing(request.code)}
                                disabled={loading}
                                variant="secondary"
                                size="sm"
                              >
                                Approve
                              </Button>
                              <Button
                                onClick={() => handleRejectPairing(request.code)}
                                disabled={loading}
                                variant="ghost"
                                size="sm"
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Allow From</div>
                      {currentAllowFrom.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No approved sender IDs yet.</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {currentAllowFrom.map((entry) => (
                            <span
                              key={entry}
                              className="rounded-full border border-border px-2 py-1 text-xs text-text"
                            >
                              {entry}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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
