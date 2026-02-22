import type { ToolStatus as ToolStatusType } from '../hooks/useChat'
import { Loader2, CheckCircle2 } from 'lucide-react'

interface ToolStatusProps {
  statuses: ToolStatusType[]
}

export function ToolStatus({ statuses }: ToolStatusProps) {
  if (statuses.length === 0) return null

  // Only show the most recent statuses
  const recent = statuses.slice(-3)

  return (
    <div className="px-3 py-1 space-y-1">
      {recent.map(ts => (
        <div key={ts.id} className="flex items-center gap-2 text-xs text-muted-foreground">
          {ts.status === 'running' ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-green-500" />
          )}
          <span className="font-medium">{ts.name}</span>
          {ts.status === 'done' && ts.result && (
            <span className="truncate max-w-[200px] opacity-70">{ts.result.slice(0, 60)}</span>
          )}
        </div>
      ))}
    </div>
  )
}
