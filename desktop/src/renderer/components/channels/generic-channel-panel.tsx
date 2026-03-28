import type { ChannelPlatform } from '@/types/channel'

interface GenericChannelPanelProps {
  selectedPlatform: ChannelPlatform
}

export function GenericChannelPanel({ selectedPlatform }: GenericChannelPanelProps) {
  const channelName = selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)

  return (
    <div className="rounded-lg border border-dashed border-border bg-bg-subtle p-6 text-center">
      <div className="text-base font-medium text-text-strong">Coming soon</div>
      <div className="mt-2 text-sm text-muted-foreground">
        {channelName} setup is not available yet in the desktop app.
      </div>
    </div>
  )
}
