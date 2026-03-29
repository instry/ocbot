import { useEffect, useRef, useState } from 'react'
import { WeixinChannelPanel } from './weixin-channel-panel'
import type { ChannelConfig, ChannelQrLoginStartResult, ChannelQrLoginWaitResult, ChannelStatus } from '@/types/channel'

const WEIXIN_QR_EXPIRES_IN_SECONDS = 300

type WeixinChannelSectionProps = {
  currentConfig?: ChannelConfig
  currentStatus?: ChannelStatus
  loading: boolean
  errorMessage: string | null
  startQrLogin: (platform: 'weixin') => Promise<ChannelQrLoginStartResult>
  waitQrLogin: (platform: 'weixin', accountId?: string) => Promise<ChannelQrLoginWaitResult>
}

export function WeixinChannelSection({
  currentConfig,
  currentStatus,
  loading,
  errorMessage,
  startQrLogin,
  waitQrLogin,
}: WeixinChannelSectionProps) {
  const [qrFlowStarted, setQrFlowStarted] = useState(false)
  const [qrWaiting, setQrWaiting] = useState(false)
  const [qrValue, setQrValue] = useState<string | null>(null)
  const [weixinQrExpired, setWeixinQrExpired] = useState(false)
  const [weixinQrExpiresIn, setWeixinQrExpiresIn] = useState<number | null>(null)
  const [supportsQrLogin, setSupportsQrLogin] = useState(false)
  const weixinExpiryTimerRef = useRef<number | null>(null)
  const weixinQrAttemptRef = useRef(0)

  const clearWeixinExpiryTimer = () => {
    if (weixinExpiryTimerRef.current !== null) {
      window.clearInterval(weixinExpiryTimerRef.current)
      weixinExpiryTimerRef.current = null
    }
  }

  useEffect(() => {
    let active = true

    const loadQrSupport = async () => {
      const supported = await window.ocbot?.supportsChannelQrLogin?.('weixin') === true
      if (active) {
        setSupportsQrLogin(supported)
      }
    }

    void loadQrSupport()
    return () => {
      active = false
      clearWeixinExpiryTimer()
    }
  }, [])

  const weixinLoginUnavailable = !supportsQrLogin
  const weixinQrActionDisabled = weixinLoginUnavailable || (loading && !weixinQrExpired)

  const handleStartQrLogin = async () => {
    const attemptId = weixinQrAttemptRef.current + 1
    weixinQrAttemptRef.current = attemptId
    setQrFlowStarted(true)
    setQrValue(null)
    setWeixinQrExpired(false)
    setWeixinQrExpiresIn(null)

    const startResult = await startQrLogin('weixin')
    if (weixinQrAttemptRef.current !== attemptId) {
      return
    }
    if (!startResult.qrDataUrl) {
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
          }
          return 0
        }
        return current - 1
      })
    }, 1000)

    setQrWaiting(true)
    try {
      const waitResult = await waitQrLogin('weixin', startResult.sessionKey)
      if (weixinQrAttemptRef.current !== attemptId) {
        return
      }
      if (waitResult.connected) {
        clearWeixinExpiryTimer()
        setQrValue(null)
        setQrFlowStarted(false)
        setWeixinQrExpired(false)
        setWeixinQrExpiresIn(null)
      }
    } catch (waitError) {
      if (weixinQrAttemptRef.current === attemptId) {
        throw waitError
      }
    } finally {
      if (weixinQrAttemptRef.current === attemptId) {
        setQrWaiting(false)
      }
    }
  }

  return (
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
      errorMessage={errorMessage}
      onStartQrLogin={handleStartQrLogin}
    />
  )
}
