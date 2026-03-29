import { useEffect, useRef, useState } from 'react'
import { FeishuChannelPanel } from './feishu-channel-panel'
import type { ChannelConfig, ChannelPairingRequest } from '@/types/channel'

type FeishuManualDraft = {
  domain: string
  appId: string
  appSecret: string
}

type FeishuChannelSectionProps = {
  currentConfig?: ChannelConfig
  currentPairingRequests: ChannelPairingRequest[]
  currentAllowFrom: string[]
  loading: boolean
  errorMessage: string | null
  loadConfig: (platform: 'feishu') => Promise<unknown>
  saveConfig: (platform: 'feishu', config: ChannelConfig) => Promise<unknown>
  approvePairingCode: (platform: 'feishu', code: string) => Promise<boolean>
  rejectPairingRequest: (platform: 'feishu', code: string) => Promise<boolean>
}

const DEFAULT_FEISHU_DOMAIN = 'feishu'

export function FeishuChannelSection({
  currentConfig,
  currentPairingRequests,
  currentAllowFrom,
  loading,
  errorMessage,
  loadConfig,
  saveConfig,
  approvePairingCode,
  rejectPairingRequest,
}: FeishuChannelSectionProps) {
  const [qrFlowStarted, setQrFlowStarted] = useState(false)
  const [qrWaiting, setQrWaiting] = useState(false)
  const [qrValue, setQrValue] = useState<string | null>(null)
  const [qrMessage, setQrMessage] = useState<string | null>(null)
  const [feishuAuthMessage, setFeishuAuthMessage] = useState<string | null>(null)
  const [feishuExpiresIn, setFeishuExpiresIn] = useState<number | null>(null)
  const [feishuManualDraft, setFeishuManualDraft] = useState<FeishuManualDraft>({
    domain: DEFAULT_FEISHU_DOMAIN,
    appId: '',
    appSecret: '',
  })
  const [feishuManualDirty, setFeishuManualDirty] = useState(false)
  const [pairingCodeInput, setPairingCodeInput] = useState('')
  const [pairingActionMessage, setPairingActionMessage] = useState<string | null>(null)
  const feishuPollTimerRef = useRef<number | null>(null)
  const feishuCountdownTimerRef = useRef<number | null>(null)

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

  useEffect(() => {
    if (feishuManualDirty) {
      return
    }

    setFeishuManualDraft({
      domain: currentConfig?.domain?.trim() || DEFAULT_FEISHU_DOMAIN,
      appId: currentConfig?.appId ?? '',
      appSecret: currentConfig?.appSecret ?? '',
    })
  }, [currentConfig?.appId, currentConfig?.appSecret, currentConfig?.domain, feishuManualDirty])

  useEffect(() => {
    return () => {
      clearFeishuTimers()
    }
  }, [])

  const feishuQrExpired = qrFlowStarted && !!qrValue && feishuExpiresIn === 0
  const feishuQrActionDisabled = loading || (qrWaiting && !feishuQrExpired)
  const feishuConfigured = Boolean(currentConfig?.appId?.trim() && currentConfig?.appSecret?.trim())
  const feishuManualConfigured = Boolean(feishuManualDraft.appId.trim() && feishuManualDraft.appSecret.trim())

  const handleFeishuManualChange = (patch: Partial<FeishuManualDraft>) => {
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
    clearFeishuTimers()
    setQrFlowStarted(true)
    setQrWaiting(true)
    setQrValue(null)
    setQrMessage(null)
    setFeishuAuthMessage(null)
    setFeishuExpiresIn(null)
    setPairingActionMessage(null)

    try {
      if (!window.ocbot) {
        throw new Error('Ocbot desktop bridge not available')
      }
      const isLark = (currentConfig?.domain ?? '').trim().toLowerCase() === 'lark'
      const startResult = await window.ocbot.startFeishuInstallQrcode(isLark)
      setQrValue(startResult.url)
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
        setQrMessage('Feishu authorization completed.')
      }

      feishuPollTimerRef.current = window.setInterval(() => {
        void pollOnce()
      }, Math.max(startResult.interval, 3) * 1000)
    } catch (nextError) {
      clearFeishuTimers()
      setQrWaiting(false)
      setQrFlowStarted(false)
      setFeishuAuthMessage(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }

  const handleApprovePairing = async (code?: string) => {
    const resolvedCode = (code ?? pairingCodeInput).trim().toUpperCase()
    if (!resolvedCode) return
    const approved = await approvePairingCode('feishu', resolvedCode)
    setPairingActionMessage(approved ? `Approved ${resolvedCode}` : `Unable to approve ${resolvedCode}`)
    if (approved && resolvedCode === pairingCodeInput.trim().toUpperCase()) {
      setPairingCodeInput('')
    }
  }

  const handleRejectPairing = async (code: string) => {
    const rejected = await rejectPairingRequest('feishu', code)
    setPairingActionMessage(rejected ? `Rejected ${code}` : `Unable to reject ${code}`)
  }

  return (
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
      errorMessage={errorMessage}
      onStartQrLogin={handleStartQrLogin}
      onFeishuManualChange={handleFeishuManualChange}
      onCancelFeishuManualConfig={handleCancelFeishuManualConfig}
      onSaveFeishuManualConfig={handleSaveFeishuManualConfig}
      onPairingCodeInputChange={setPairingCodeInput}
      onApprovePairing={handleApprovePairing}
      onRejectPairing={handleRejectPairing}
    />
  )
}
