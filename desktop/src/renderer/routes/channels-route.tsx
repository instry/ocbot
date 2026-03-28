import { useEffect, useRef, useMemo, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { useChannelStore } from '@/stores/channel-store'
import { useGatewayStore } from '@/stores/gateway-store'
import type { ChannelConfig } from '@/types/channel'
import { CHANNEL_PLATFORMS } from '@/types/channel'
import { FeishuChannelPanel } from '@/components/channels/feishu-channel-panel'
import { GenericChannelPanel } from '@/components/channels/generic-channel-panel'
import { WeixinChannelPanel } from '@/components/channels/weixin-channel-panel'
import { cn } from '@/lib/utils'

const WEIXIN_QR_EXPIRES_IN_SECONDS = 300
const DEFAULT_FEISHU_DOMAIN = 'feishu'
const PRIORITY_CHANNELS = ['weixin', 'feishu'] as const

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
  const [feishuManualDraft, setFeishuManualDraft] = useState({
    domain: DEFAULT_FEISHU_DOMAIN,
    appId: '',
    appSecret: '',
  })
  const [feishuManualDirty, setFeishuManualDirty] = useState(false)
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
    setFeishuManualDirty(false)
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
  const isFeishu = selectedPlatform === 'feishu'
  const isWeixin = selectedPlatform === 'weixin'
  const weixinLoginUnavailable = selectedPlatform === 'weixin' && !supportsQrLogin
  const weixinQrActionDisabled = weixinLoginUnavailable || (loading && !weixinQrExpired)
  const feishuQrExpired = isFeishu && qrFlowStarted && !!qrValue && feishuExpiresIn === 0
  const feishuQrActionDisabled = loading || (qrWaiting && !feishuQrExpired)
  const feishuConfigured = Boolean(currentConfig?.appId?.trim() && currentConfig?.appSecret?.trim())
  const feishuManualConfigured = Boolean(feishuManualDraft.appId.trim() && feishuManualDraft.appSecret.trim())

  useEffect(() => {
    if (!isFeishu || feishuManualDirty) {
      return
    }

    setFeishuManualDraft({
      domain: currentConfig?.domain?.trim() || DEFAULT_FEISHU_DOMAIN,
      appId: currentConfig?.appId ?? '',
      appSecret: currentConfig?.appSecret ?? '',
    })
  }, [currentConfig?.appId, currentConfig?.appSecret, currentConfig?.domain, feishuManualDirty, isFeishu])

  const handleFeishuManualChange = (patch: Partial<typeof feishuManualDraft>) => {
    setFeishuManualDraft((current) => ({
      ...current,
      ...patch,
    }))
    setFeishuManualDirty(true)
  }

  const handleCancelFeishuManualConfig = () => {
    setFeishuManualDraft({
      domain: currentConfig?.domain?.trim() || DEFAULT_FEISHU_DOMAIN,
      appId: currentConfig?.appId ?? '',
      appSecret: currentConfig?.appSecret ?? '',
    })
    setFeishuManualDirty(false)
  }

  const handleSaveFeishuManualConfig = async () => {
    const nextConfig: ChannelConfig = {
      enabled: currentConfig?.enabled ?? false,
      dmPolicy: currentConfig?.dmPolicy ?? 'open',
      groupPolicy: currentConfig?.groupPolicy ?? 'open',
      ...currentConfig,
      domain: feishuManualDraft.domain,
      appId: feishuManualDraft.appId.trim(),
      appSecret: feishuManualDraft.appSecret.trim(),
    }

    await saveConfig('feishu', nextConfig)
    setFeishuManualDirty(false)
  }

  const handleStartQrLogin = async () => {
    if (!selectedPlatform) return
    const attemptId = weixinQrAttemptRef.current + 1
    weixinQrAttemptRef.current = attemptId
    setQrFlowStarted(true)
    setPairingActionMessage(null)
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
          throw new Error('Ocbot desktop bridge not available')
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
          setQrFlowStarted(false)
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
        setQrFlowStarted(false)
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
      setQrFlowStarted(false)
      return
    }

    if (selectedPlatform !== 'weixin') {
      setQrFlowStarted(false)
      return
    }

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
    setQrWaiting(true)
    try {
      const waitResult = await waitQrLogin(selectedPlatform, startResult.sessionKey)
      if (selectedPlatform === 'weixin' && weixinQrAttemptRef.current !== attemptId) {
        return
      }
      setQrMessage(waitResult.message)
      if (waitResult.connected) {
        clearWeixinExpiryTimer()
        setQrValue(null)
        setQrFlowStarted(false)
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

            {isWeixin ? (
              <WeixinChannelPanel
                currentConfig={currentConfig}
                currentStatus={currentStatus}
                qrFlowStarted={qrFlowStarted}
                qrWaiting={qrWaiting}
                qrValue={qrValue}
                weixinQrExpiresIn={weixinQrExpiresIn}
                weixinQrExpired={weixinQrExpired}
                weixinQrActionDisabled={weixinQrActionDisabled}
                weixinLoginUnavailable={weixinLoginUnavailable}
                errorMessage={currentStatus?.lastError || error}
                onStartQrLogin={handleStartQrLogin}
              />
            ) : isFeishu ? (
              <FeishuChannelPanel
                currentAppId={currentConfig?.appId}
                qrFlowStarted={qrFlowStarted}
                qrWaiting={qrWaiting}
                qrValue={qrValue}
                qrMessage={qrMessage}
                feishuAuthMessage={feishuAuthMessage}
                feishuExpiresIn={feishuExpiresIn}
                feishuQrExpired={feishuQrExpired}
                feishuQrActionDisabled={feishuQrActionDisabled}
                feishuManualDraft={feishuManualDraft}
                feishuManualDirty={feishuManualDirty}
                feishuConfigured={feishuConfigured}
                feishuManualConfigured={feishuManualConfigured}
                pairingCodeInput={pairingCodeInput}
                pairingActionMessage={pairingActionMessage}
                currentPairingRequests={currentPairingRequests}
                currentAllowFrom={currentAllowFrom}
                loading={loading}
                errorMessage={currentStatus?.lastError || error}
                onStartQrLogin={handleStartQrLogin}
                onFeishuManualChange={handleFeishuManualChange}
                onCancelFeishuManualConfig={handleCancelFeishuManualConfig}
                onSaveFeishuManualConfig={handleSaveFeishuManualConfig}
                onPairingCodeInputChange={setPairingCodeInput}
                onApprovePairing={handleApprovePairing}
                onRejectPairing={handleRejectPairing}
              />
            ) : selectedPlatform ? (
              <GenericChannelPanel
                selectedPlatform={selectedPlatform}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
