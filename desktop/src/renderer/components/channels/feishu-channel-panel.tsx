import { QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface FeishuManualDraft {
  domain: string
  appId: string
  appSecret: string
}

interface FeishuChannelPanelProps {
  currentAppId?: string
  qrFlowStarted: boolean
  qrWaiting: boolean
  qrValue: string | null
  qrMessage: string | null
  feishuAuthMessage: string | null
  feishuExpiresIn: number | null
  feishuQrExpired: boolean
  feishuQrActionDisabled: boolean
  feishuManualDraft: FeishuManualDraft
  feishuManualDirty: boolean
  feishuConfigured: boolean
  feishuManualConfigured: boolean
  pairingActionMessage: string | null
  loading: boolean
  errorMessage: string | null
  onStartQrLogin: () => void
  onFeishuManualChange: (patch: Partial<FeishuManualDraft>) => void
  onCancelFeishuManualConfig: () => void
  onSaveFeishuManualConfig: () => void
}

export function FeishuChannelPanel({
  currentAppId,
  qrFlowStarted,
  qrWaiting,
  qrValue,
  qrMessage,
  feishuAuthMessage,
  feishuExpiresIn,
  feishuQrExpired,
  feishuQrActionDisabled,
  feishuManualDraft,
  feishuManualDirty,
  feishuConfigured,
  feishuManualConfigured,
  pairingActionMessage,
  loading,
  errorMessage,
  onStartQrLogin,
  onFeishuManualChange,
  onCancelFeishuManualConfig,
  onSaveFeishuManualConfig,
}: FeishuChannelPanelProps) {
  const { t } = useI18n()
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
        {(!qrFlowStarted && !qrWaiting && !qrValue) && (
          <>
            <Button
              onClick={onStartQrLogin}
              disabled={feishuQrActionDisabled}
              variant="primary"
              size="md"
              className="w-full text-white"
            >
              <QrCode className="h-4 w-4" />
              {currentAppId ? t('Scan to Recreate Credentials') : t('Scan to Create Credentials')}
            </Button>
          </>
        )}

        {qrWaiting && !qrValue && (
          <div className="flex items-center justify-center gap-2 py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="text-sm text-muted-foreground">{t('Generating QR code...')}</span>
          </div>
        )}

        {qrValue && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="p-3 bg-white rounded-lg border border-border">
                <QRCodeSVG value={qrValue} size={192} />
              </div>
            </div>

            {feishuExpiresIn !== null && feishuExpiresIn > 0 && (
              <div className="text-center text-xs text-muted-foreground">
                {t('Expires in {{seconds}}s', { seconds: feishuExpiresIn })}
              </div>
            )}

            {feishuQrExpired && (
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="text-danger">{t('This QR code has expired.')}</span>
                <button
                  onClick={onStartQrLogin}
                  disabled={feishuQrActionDisabled}
                  className="font-medium text-accent hover:text-accent/80 hover:underline disabled:opacity-50"
                >
                  {t('Refresh')}
                </button>
              </div>
            )}

            {!feishuQrExpired && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>{t('Scan with Feishu')}</span>
              </div>
            )}
          </div>
        )}

        {(qrMessage || feishuAuthMessage) && (
          <div className="space-y-2">
            {qrMessage && (
              <div
                className={cn(
                  'text-xs',
                  qrMessage === 'Feishu authorization completed.'
                    ? 'flex items-center gap-1.5 text-ok'
                    : 'text-muted-foreground',
                )}
              >
                {qrMessage === 'Feishu authorization completed.' ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-ok" />
                    {t('Feishu is connected')}
                  </>
                ) : qrMessage}
              </div>
            )}
            {feishuAuthMessage && (
              <div className="text-xs text-muted-foreground">{feishuAuthMessage}</div>
            )}
          </div>
        )}
      </div>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-bg px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('OR Manual configuration')}</span>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-bg-subtle p-4">
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('Domain')}</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'feishu', label: t('Feishu (China)') },
                { value: 'lark', label: t('Lark (Global)') },
              ].map((option) => {
                const active = feishuManualDraft.domain === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onFeishuManualChange({ domain: option.value })}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-bg text-text hover:bg-bg-hover',
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('App ID')}</label>
            <Input
              value={feishuManualDraft.appId}
              onChange={(event) => onFeishuManualChange({ appId: event.target.value })}
              placeholder={t('Enter App ID')}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t('App Secret')}</label>
            <Input
              type="password"
              value={feishuManualDraft.appSecret}
              onChange={(event) => onFeishuManualChange({ appSecret: event.target.value })}
              placeholder={t('Enter App Secret')}
            />
          </div>

          <div className="flex items-center justify-start gap-3 pt-2">
            <Button
              onClick={onCancelFeishuManualConfig}
              disabled={loading || !feishuManualDirty}
              variant="secondary"
              size="md"
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={onSaveFeishuManualConfig}
              disabled={loading || !feishuManualDirty}
              variant="primary"
              size="md"
            >
              {t('Save')}
            </Button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-lg">
          {errorMessage}
        </div>
      )}
    </div>
  )
}
