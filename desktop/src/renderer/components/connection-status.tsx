import { Loader2, WifiOff } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useGatewayStore } from '@/stores/gateway-store'
import { cn } from '@/lib/utils'

export function ConnectionStatus() {
  const { t } = useI18n()
  const status = useGatewayStore(s => s.status)
  const reconnectAttempt = useGatewayStore(s => s.reconnectAttempt)

  if (status === 'connected') return null

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-lg animate-scale-in',
        status === 'connecting' && 'border border-warn/20 bg-warn/10 text-warn',
        (status === 'disconnected' || status === 'error') &&
          'border border-destructive/20 bg-destructive/10 text-destructive'
      )}
    >
      {status === 'connecting' ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {t('Connecting{{attemptSuffix}}...', {
              attemptSuffix: reconnectAttempt > 0
                ? t(' (attempt {{attempt}})', { attempt: reconnectAttempt })
                : '',
            })}
          </span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>{t('Disconnected')}</span>
        </>
      )}
    </div>
  )
}
