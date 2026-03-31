import type { ChannelPlatform } from '@/types/channel'
import { useI18n } from '@/lib/i18n'

interface GenericChannelPanelProps {
  selectedPlatform: ChannelPlatform
}

export function GenericChannelPanel({ selectedPlatform }: GenericChannelPanelProps) {
  const { t } = useI18n()
  const channelName = selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)

  return (
    <div className="rounded-lg border border-dashed border-border bg-bg-subtle p-6 text-center">
      <div className="text-base font-medium text-text-strong">{t('Coming soon')}</div>
      <div className="mt-2 text-sm text-muted-foreground">
        {t('{{channel}} setup is not available yet in the desktop app.', { channel: channelName })}
      </div>
    </div>
  )
}
