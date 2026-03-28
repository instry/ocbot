import { QRCodeSVG } from 'qrcode.react'
import { ChannelConfigForm } from '@/components/channels/channel-config-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ChannelConfig, ChannelPairingRequest, ChannelPlatform, ChannelStatus } from '@/types/channel'

interface GenericChannelPanelProps {
  selectedPlatform: ChannelPlatform
  currentConfig?: ChannelConfig
  currentStatus?: ChannelStatus
  currentPairingRequests: ChannelPairingRequest[]
  currentAllowFrom: string[]
  supportsQrLogin: boolean
  supportsPairing: boolean
  qrWaiting: boolean
  qrDataUrl: string | null
  qrSvgMarkup: string | null
  qrValue: string | null
  qrMessage: string | null
  pairingCodeInput: string
  pairingActionMessage: string | null
  loading: boolean
  error: string | null
  onConfigChange: (config: ChannelConfig) => void
  onStartQrLogin: () => void
  onPairingCodeInputChange: (value: string) => void
  onApprovePairing: (code?: string) => void
  onRejectPairing: (code: string) => void
  onStart: () => void
  onStop: () => void
}

export function GenericChannelPanel({
  selectedPlatform,
  currentConfig,
  currentStatus,
  currentPairingRequests,
  currentAllowFrom,
  supportsQrLogin,
  supportsPairing,
  qrWaiting,
  qrDataUrl,
  qrSvgMarkup,
  qrValue,
  qrMessage,
  pairingCodeInput,
  pairingActionMessage,
  loading,
  error,
  onConfigChange,
  onStartQrLogin,
  onPairingCodeInputChange,
  onApprovePairing,
  onRejectPairing,
  onStart,
  onStop,
}: GenericChannelPanelProps) {
  return (
    <>
      {currentStatus && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-strong">Status</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${currentStatus.connected ? 'bg-ok' : 'bg-muted'}`} />
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
          onChange={onConfigChange}
        />
      </div>

      {(supportsQrLogin || supportsPairing) && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-text-strong">Auth</h3>

          {supportsQrLogin && (
            <div className="space-y-3 rounded-lg border border-border bg-bg-subtle p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-text-strong">QR Login</div>
                <Button
                  onClick={onStartQrLogin}
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
                  onChange={(event) => onPairingCodeInputChange(event.target.value.toUpperCase())}
                  placeholder="Enter code"
                />
                <Button
                  onClick={() => onApprovePairing()}
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
                          onClick={() => onApprovePairing(request.code)}
                          disabled={loading}
                          variant="secondary"
                          size="sm"
                        >
                          Approve
                        </Button>
                        <Button
                          onClick={() => onRejectPairing(request.code)}
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

      {error && (
        <div className="rounded-md border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-start gap-3 pt-4">
        <Button
          onClick={onStart}
          disabled={loading || currentConfig?.enabled}
          variant="primary"
          size="md"
          className="w-32"
        >
          {loading ? 'Starting...' : 'Start'}
        </Button>
        <Button
          onClick={onStop}
          disabled={loading || !currentConfig?.enabled}
          variant="secondary"
          size="md"
          className="w-32"
        >
          Stop
        </Button>
      </div>
    </>
  )
}
