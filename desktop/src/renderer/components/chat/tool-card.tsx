import { memo, useCallback } from 'react'
import { Loader2, Check, CircleX, ChevronRight } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { cn } from '@/lib/utils'
import type { ToolCard as ToolCardType } from '@/types/chat'

interface ToolCardProps {
  tool: ToolCardType
}

export const ToolCard = memo(function ToolCard({ tool }: ToolCardProps) {
  const toggleToolCard = useChatStore(s => s.toggleToolCard)

  const handleToggle = useCallback(() => {
    toggleToolCard(tool.id)
  }, [tool.id, toggleToolCard])

  const StatusIcon = tool.phase === 'done'
    ? Check
    : tool.phase === 'error'
      ? CircleX
      : Loader2

  return (
    <div
      className={cn(
        'rounded-lg border bg-card animate-scale-in overflow-hidden',
        tool.phase === 'running' && 'border-accent/30',
        tool.phase === 'done' && 'border-border',
        tool.phase === 'error' && 'border-destructive/30',
      )}
    >
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-bg-hover"
      >
        <StatusIcon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            tool.phase === 'running' && 'animate-spin text-accent',
            tool.phase === 'done' && 'text-ok',
            tool.phase === 'error' && 'text-destructive',
          )}
        />
        <span className="font-mono font-medium">{tool.name}</span>
        <span className="flex-1" />
        <ChevronRight
          className={cn(
            'h-3 w-3 text-muted-foreground transition-transform',
            tool.expanded && 'rotate-90',
          )}
        />
      </button>
      {tool.expanded && tool.output && (
        <div className="border-t border-border">
          <pre className="max-h-[200px] overflow-auto bg-bg-muted p-3 font-mono text-xs text-muted-foreground">
            {tool.output}
          </pre>
        </div>
      )}
    </div>
  )
})
