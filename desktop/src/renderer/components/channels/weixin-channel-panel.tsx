import { QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import type { ChannelConfig, ChannelStatus } from '@/types/channel'

interface WeixinChannelPanelProps {
  currentConfig?: ChannelConfig
  currentStatus?: ChannelStatus
  qrFlowStarted: boolean
  qrWaiting: boolean
  qrValue: string | null
  weixinQrExpiresIn: number | null
  weixinQrExpired: boolean
  weixinQrActionDisabled: boolean
  weixinLoginUnavailable: boolean
  errorMessage: string | null
  onStartQrLogin: () => void
}

export function WeixinChannelPanel({
  currentConfig,
  currentStatus,
  qrFlowStarted,
  qrWaiting,
  qrValue,
  weixinQrExpiresIn,
  weixinQrExpired,
  weixinQrActionDisabled,
  weixinLoginUnavailable,
  errorMessage,
  onStartQrLogin,
}: WeixinChannelPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
        {(!qrFlowStarted && !qrWaiting) && (
          <>
            <Button
              onClick={onStartQrLogin}
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
                  onClick={onStartQrLogin}
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

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1.5">How to connect:</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Click "Scan to Connect" to generate a QR code</li>
          <li>Open WeChat on your phone and scan the code</li>
          <li>Confirm the login on your phone</li>
        </ol>
      </div>

      {(weixinLoginUnavailable || errorMessage) && (
        <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">
          {weixinLoginUnavailable ? 'WeChat login is temporarily unavailable' : errorMessage}
        </div>
      )}
    </div>
  )
}
