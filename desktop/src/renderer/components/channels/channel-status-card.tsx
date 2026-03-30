import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ChannelStatus } from '@/types/channel'
import { cn } from '@/lib/utils'

interface ChannelStatusCardProps {
  status: ChannelStatus | undefined
  className?: string
}

export function ChannelStatusCard({ status, className }: ChannelStatusCardProps) {
  if (!status) {
    return (
      <Card className={cn('bg-bg-subtle', className)}>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          No status available
        </CardContent>
      </Card>
    )
  }

  const { connected, startedAt, lastError, botInfo } = status

  return (
    <Card className={cn('bg-bg-subtle', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          Status
          <Badge variant={connected ? 'accent' : 'secondary'}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {botInfo && (
          <div>
            <span className="text-muted-foreground">Bot: </span>
            <span className="text-text">{botInfo.username || botInfo.name || botInfo.id}</span>
          </div>
        )}
        {startedAt && (
          <div>
            <span className="text-muted-foreground">Started: </span>
            <span className="text-text">{new Date(startedAt).toLocaleString()}</span>
          </div>
        )}
        {lastError && (
          <div className="text-danger text-xs mt-2 p-2 bg-danger/10 rounded">
            {lastError}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
