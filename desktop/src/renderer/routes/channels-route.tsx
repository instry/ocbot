import { useEffect, useRef, useMemo, useState } from 'react'
import { Radio, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useChannelStore } from '@/stores/channel-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { CHANNEL_PLATFORMS } from '@/types/channel'
import { ChannelConfigForm } from '@/components/channels/channel-config-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function normalizeQrPayload(rawValue?: string | null): {
  imageSrc: string | null
  svgMarkup: string | null
  qrValue: string | null
} {
  const value = rawValue?.trim()
  if (!value) {
    return { imageSrc: null, svgMarkup: null, qrValue: null }
  }

  if (value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('http://') || value.startsWith('https://')) {
    return { imageSrc: value, svgMarkup: null, qrValue: null }
  }

  if (value.startsWith('<svg') || value.startsWith('<?xml')) {
    return { imageSrc: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`, svgMarkup: value, qrValue: null }
  }

  const sanitized = value.replace(/\s+/g, '')
  if (/^[A-Za-z0-9+/=]+$/.test(sanitized)) {
    try {
      const decoded = atob(sanitized)
      const trimmedDecoded = decoded.trimStart()
      if (trimmedDecoded.startsWith('<svg') || trimmedDecoded.startsWith('<?xml')) {
        return {
          imageSrc: `data:image/svg+xml;base64,${sanitized}`,
          svgMarkup: decoded,
          qrValue: null,
        }
      }
      if (
        trimmedDecoded.startsWith('data:')
        || trimmedDecoded.startsWith('http://')
        || trimmedDecoded.startsWith('https://')
      ) {
        return {
          imageSrc: trimmedDecoded,
          svgMarkup: null,
          qrValue: null,
        }
      }
    } catch {}

    if (sanitized.length > 120) {
      return { imageSrc: `data:image/png;base64,${sanitized}`, svgMarkup: null, qrValue: null }
    }
  }

  return { imageSrc: null, svgMarkup: null, qrValue: value }
}

const WEIXIN_QR_EXPIRES_IN_SECONDS = 300

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
  const [qrSvgMarkup, setQrSvgMarkup] = useState<string | null>(null)
  const [qrValue, setQrValue] = useState<string | null>(null)
  const [qrMessage, setQrMessage] = useState<string | null>(null)
  const [pairingCodeInput, setPairingCodeInput] = useState('')
  const [pairingActionMessage, setPairingActionMessage] = useState<string | null>(null)
  const [qrWaiting, setQrWaiting] = useState(false)
  const [qrFlowStarted, setQrFlowStarted] = useState(false)
  const [weixinQrExpired, setWeixinQrExpired] = useState(false)
  const [weixinQrExpiresIn, setWeixinQrExpiresIn] = useState<number | null>(null)
  const [supportsQrLogin, setSupportsQrLogin] = useState(false)
  const [feishuAuthMessage, setFeishuAuthMessage] = useState<string | null>(null)
  const [feishuExpiresIn, setFeishuExpiresIn] = useState<number | null>(null)
  const feishuPollTimerRef = useRef<number | null>(null)
  const feishuCountdownTimerRef = useRef<number | null>(null)
  const weixinExpiryTimerRef = useRef<number | null>(null)
  const weixinQrAttemptRef = useRef(0)

  const clearFeishuTimers = () => {
    if (feishuPollTimerRef.current !== null) {
      window.clearInterval(feishuPollTimerRef.current)
      feishuPollTimerRef.current = null
    }
    if (feishuCountdownTimerRef.current !== null) {
      window.clearInterval(feishuCountdownTimerRef.current)
      feishuCountdownTimerRef.current = null
    }
  }

  const clearWeixinExpiryTimer = () => {
    if (weixinExpiryTimerRef.current !== null) {
      window.clearInterval(weixinExpiryTimerRef.current)
      weixinExpiryTimerRef.current = null
    }
  }

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
    setQrSvgMarkup(null)
    setQrValue(null)
    setQrMessage(null)
    setFeishuAuthMessage(null)
    setFeishuExpiresIn(null)
    setPairingCodeInput('')
    setPairingActionMessage(null)
    setQrWaiting(false)
    setQrFlowStarted(false)
    setWeixinQrExpired(false)
    setWeixinQrExpiresIn(null)
    clearFeishuTimers()
    clearWeixinExpiryTimer()
  }, [selectedPlatform])

  useEffect(() => {
    return () => {
      clearFeishuTimers()
      clearWeixinExpiryTimer()
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadQrSupport = async () => {
      if (!selectedPlatform) {
        if (active) setSupportsQrLogin(false)
        return
      }

      if (selectedPlatform === 'whatsapp' || selectedPlatform === 'feishu') {
        if (active) setSupportsQrLogin(true)
        return
      }

      if (selectedPlatform !== 'weixin') {
        if (active) setSupportsQrLogin(false)
        return
      }

      const supported = await window.ocbot?.supportsChannelQrLogin?.(selectedPlatform) === true
      if (active) {
        setSupportsQrLogin(supported)
      }
    }

    void loadQrSupport()
    return () => { active = false }
  }, [selectedPlatform])

  const selectedChannel = CHANNEL_PLATFORMS.find(c => c.id === selectedPlatform)
  const currentConfig = selectedPlatform ? configs[selectedPlatform] : undefined
  const currentStatus = selectedPlatform ? statuses[selectedPlatform] : undefined
  const currentPairingRequests = selectedPlatform ? pairingRequests[selectedPlatform] ?? [] : []
  const currentAllowFrom = selectedPlatform ? allowFrom[selectedPlatform] ?? [] : []
  const supportsPairing = useMemo(() => {
    if (!selectedPlatform || !currentConfig) return false
    return currentConfig.dmPolicy === 'pairing' || currentConfig.groupPolicy === 'pairing' || currentPairingRequests.length > 0
  }, [currentConfig, currentPairingRequests.length, selectedPlatform])
  const isFeishu = selectedPlatform === 'feishu'
  const isWeixin = selectedPlatform === 'weixin'
  const weixinLoginUnavailable = selectedPlatform === 'weixin' && !supportsQrLogin
  const weixinQrActionDisabled = weixinLoginUnavailable || (loading && !weixinQrExpired)

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
    const attemptId = weixinQrAttemptRef.current + 1
    weixinQrAttemptRef.current = attemptId
    setQrFlowStarted(true)
    setPairingActionMessage(null)
    setQrDataUrl(null)
    setQrSvgMarkup(null)
    setQrValue(null)
    setWeixinQrExpired(false)
    setWeixinQrExpiresIn(null)
    setFeishuAuthMessage(null)
    setFeishuExpiresIn(null)

    if (selectedPlatform === 'feishu') {
      clearFeishuTimers()
      setQrWaiting(true)
      try {
        if (!window.ocbot) {
          throw new Error('Electron channel bridge not available')
        }
        const isLark = (currentConfig?.domain ?? '').trim().toLowerCase() === 'lark'
        const startResult = await window.ocbot.startFeishuInstallQrcode(isLark)
        setQrValue(startResult.url)
        setQrMessage('Scan the QR code in Feishu to authorize bot creation.')
        setFeishuAuthMessage(`Waiting for authorization${isLark ? ' (Lark)' : ' (Feishu)'}`)
        setFeishuExpiresIn(startResult.expireIn)

        feishuCountdownTimerRef.current = window.setInterval(() => {
          setFeishuExpiresIn((current) => {
            if (current === null) return current
            if (current <= 1) {
              clearFeishuTimers()
              setQrWaiting(false)
              setFeishuAuthMessage('Authorization QR expired. Generate a new code to continue.')
              return 0
            }
            return current - 1
          })
        }, 1000)

        const pollOnce = async () => {
          const result = await window.ocbot!.pollFeishuInstall(startResult.deviceCode)
          if (result.error) {
            clearFeishuTimers()
            setQrWaiting(false)
            setFeishuAuthMessage(result.error)
            return
          }

          if (!result.done || !result.appId || !result.appSecret) {
            return
          }

          const verification = await window.ocbot!.verifyFeishuCredentials(result.appId, result.appSecret)
          if (!verification.success) {
            clearFeishuTimers()
            setQrWaiting(false)
            setFeishuAuthMessage(verification.error ?? 'Failed to verify Feishu credentials')
            return
          }

          await saveConfig('feishu', {
            enabled: true,
            dmPolicy: currentConfig?.dmPolicy ?? 'open',
            groupPolicy: currentConfig?.groupPolicy ?? 'open',
            ...currentConfig,
            appId: result.appId,
            appSecret: result.appSecret,
            domain: result.domain ?? (isLark ? 'lark' : 'feishu'),
          })
          await loadConfig('feishu')
          clearFeishuTimers()
          setQrWaiting(false)
          setQrValue(null)
          setFeishuExpiresIn(null)
          setFeishuAuthMessage('Feishu app created and credentials saved.')
          setQrMessage('Feishu authorization completed.')
        }

        feishuPollTimerRef.current = window.setInterval(() => {
          void pollOnce()
        }, Math.max(startResult.interval, 3) * 1000)
      } catch (error) {
        clearFeishuTimers()
        setQrWaiting(false)
        setFeishuAuthMessage(error instanceof Error ? error.message : String(error))
      }
      return
    }

    const startResult = await startQrLogin(selectedPlatform)
    if (selectedPlatform === 'weixin' && weixinQrAttemptRef.current !== attemptId) {
      return
    }
    setQrMessage(startResult.message)
    if (!startResult.qrDataUrl) {
      return
    }

    if (selectedPlatform === 'weixin') {
      setQrValue(startResult.qrDataUrl.trim())
      setWeixinQrExpiresIn(WEIXIN_QR_EXPIRES_IN_SECONDS)
      clearWeixinExpiryTimer()
      weixinExpiryTimerRef.current = window.setInterval(() => {
        setWeixinQrExpiresIn((current) => {
          if (current === null) return current
          if (current <= 1) {
            clearWeixinExpiryTimer()
            if (weixinQrAttemptRef.current === attemptId) {
              weixinQrAttemptRef.current += 1
              setQrWaiting(false)
              setWeixinQrExpired(true)
              setQrMessage('This QR code has expired. Click Refresh to generate a new one.')
            }
            return 0
          }
          return current - 1
        })
      }, 1000)
    } else {
      const normalizedQr = normalizeQrPayload(startResult.qrDataUrl)
      setQrDataUrl(normalizedQr.imageSrc)
      setQrSvgMarkup(normalizedQr.svgMarkup)
      setQrValue(normalizedQr.qrValue)
    }
    setQrWaiting(true)
    try {
      const waitResult = await waitQrLogin(selectedPlatform, startResult.sessionKey)
      if (selectedPlatform === 'weixin' && weixinQrAttemptRef.current !== attemptId) {
        return
      }
      setQrMessage(waitResult.message)
      if (waitResult.connected) {
        clearWeixinExpiryTimer()
        setQrDataUrl(null)
        setQrSvgMarkup(null)
        setQrValue(null)
        setWeixinQrExpired(false)
        setWeixinQrExpiresIn(null)
      }
    } catch (waitError) {
      if (selectedPlatform !== 'weixin' || weixinQrAttemptRef.current === attemptId) {
        throw waitError
      }
    } finally {
      if (selectedPlatform !== 'weixin' || weixinQrAttemptRef.current === attemptId) {
        setQrWaiting(false)
      }
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
              <h2 className="text-xl font-semibold text-text-strong">{selectedChannel?.label}</h2>
            </div>

            <>
              {isWeixin ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
                    {(!qrFlowStarted && !qrWaiting) && (
                      <>
                        <Button
                          onClick={handleStartQrLogin}
                          disabled={weixinQrActionDisabled}
                          variant="primary"
                          size="md"
                          className="w-full text-white"
                        >
                          <QrCode className="h-4 w-4" />
                          {currentStatus?.connected ? 'Reconnect with WeChat' : 'Scan to Connect'}
                        </Button>
                        {currentStatus?.connected && (
                          <div className="flex items-center gap-1.5 text-xs text-ok">
                            <span className="h-2 w-2 rounded-full bg-ok" />
                            WeChat is connected
                            {currentConfig?.accountId && (
                              <span className="text-muted-foreground ml-1">· {currentConfig.accountId}</span>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {qrFlowStarted && !qrValue && (
                      <div className="flex items-center justify-center gap-2 py-4">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                        <span className="text-sm text-muted-foreground">Generating QR code...</span>
                      </div>
                    )}

                    {qrFlowStarted && qrValue && (
                      <div className="space-y-3">
                        <div className="flex justify-center">
                          <div className="p-3 bg-white rounded-lg border border-border">
                            <QRCodeSVG value={qrValue} size={192} />
                          </div>
                        </div>
                        {weixinQrExpiresIn !== null && !weixinQrExpired && (
                          <div className="text-center text-xs text-muted-foreground">
                            Expires in {weixinQrExpiresIn}s
                          </div>
                        )}
                        {weixinQrExpired && (
                          <div className="flex items-center justify-center gap-2 text-xs">
                            <span className="text-danger">
                              This QR code has expired.
                            </span>
                            <button
                              onClick={handleStartQrLogin}
                              disabled={weixinQrActionDisabled}
                              className="font-medium text-accent hover:text-accent/80 hover:underline disabled:opacity-50"
                            >
                              Refresh
                            </button>
                          </div>
                        )}
                        {!weixinQrExpired && (
                          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <span>Scan with WeChat</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tips - always visible */}
                  <div className="rounded-lg border border-dashed border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">How to connect:</p>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Click "Scan to Connect" to generate a QR code</li>
                      <li>Open WeChat on your phone and scan the code</li>
                      <li>Confirm the login on your phone</li>
                    </ol>
                  </div>

                  {(weixinLoginUnavailable || currentStatus?.lastError || error) && (
                    <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">
                      {weixinLoginUnavailable ? 'WeChat login is temporarily unavailable' : currentStatus?.lastError || error}
                    </div>
                  )}
                </div>
              ) : (
                <>
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

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-text-strong">Configuration</h3>
                    <ChannelConfigForm
                      platform={selectedPlatform}
                      config={currentConfig}
                      onChange={handleConfigChange}
                    />
                  </div>
                </>
              )}

              {(supportsQrLogin || supportsPairing) && !isWeixin && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-text-strong">Auth</h3>

                  {supportsQrLogin && (
                    <div className="space-y-3 rounded-lg border border-border bg-bg-subtle p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-text-strong">QR Login</div>
                        <Button
                          onClick={handleStartQrLogin}
                          disabled={loading || qrWaiting}
                          variant="secondary"
                          size="md"
                        >
                          {qrWaiting ? 'Waiting...' : (qrDataUrl || qrSvgMarkup || qrValue) ? 'Refresh' : 'Generate QR'}
                        </Button>
                      </div>

                      {qrMessage && (
                        <div className="text-xs text-muted-foreground">{qrMessage}</div>
                      )}

                      {isFeishu && feishuAuthMessage && (
                        <div className="text-xs text-muted-foreground">{feishuAuthMessage}</div>
                      )}

                      {isFeishu && feishuExpiresIn !== null && feishuExpiresIn > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Expires in {feishuExpiresIn}s
                        </div>
                      )}

                      {(qrDataUrl || qrSvgMarkup || qrValue) && (
                        <div className="flex justify-center">
                          <div className="inline-flex rounded-lg bg-white p-3">
                            {qrSvgMarkup ? (
                              <div
                                className="h-48 w-48"
                                dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
                              />
                            ) : qrValue ? (
                              <QRCodeSVG value={qrValue ?? undefined} size={192} />
                            ) : (
                              <img src={qrDataUrl ?? undefined} alt="QR login" className="h-48 w-48" />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {supportsPairing && (
                    <div className="space-y-3 rounded-lg border border-border bg-bg-subtle p-4">
                      <div className="text-sm font-medium text-text-strong">Pairing</div>

                      <div className="flex items-center gap-3">
                        <Input
                          value={pairingCodeInput}
                          onChange={(event) => setPairingCodeInput(event.target.value.toUpperCase())}
                          placeholder="Enter code"
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

                      {currentPairingRequests.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">Pending</div>
                          {currentPairingRequests.map((request) => (
                            <div
                              key={`${request.code}-${request.id}`}
                              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="text-sm text-text-strong">{request.code}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {request.id}
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
                          ))}
                        </div>
                      )}

                      {currentAllowFrom.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">Approved</div>
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
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && !isWeixin && (
                <div className="rounded-md border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              {!isWeixin && (
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
              )}
            </>
          </div>
        )}
      </div>
    </div>
  )
}
