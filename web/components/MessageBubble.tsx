import type { ChatMessage } from '@/lib/types'
import { useState } from 'react'
import { ChevronDown, Loader2, CheckCircle2 } from 'lucide-react'
import { BotAvatar } from '@/components/BotAvatar'
import type { ToolStatus } from '@/lib/hooks/useChat'

interface MessageBubbleProps {
  message: ChatMessage
}

const TOOL_LABELS: Record<string, string> = {
  navigate: 'Opening page',
  act: 'Performing action',
  scroll: 'Scrolling',
  waitForNavigation: 'Waiting for page',
  extract: 'Extracting data',
  observe: 'Observing page',
  think: 'Thinking',
  ariaTree: 'Reading page structure',
  screenshot: 'Capturing screenshot',
  fillForm: 'Filling form',
}

function formatToolLabel(name: string, description?: string): string {
  if (description) {
    const label = TOOL_LABELS[name] || name
    return `${label}: ${description}`
  }
  return TOOL_LABELS[name] || name
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end px-3 py-1.5">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  // tool messages are hidden — they are rendered as part of ToolBatch
  if (message.role === 'tool') {
    return null
  }

  // Tool-only assistant messages are grouped and rendered by ChatArea
  if (message.role === 'assistant' && message.toolCalls?.length && !message.content) {
    return null
  }

  // assistant text message
  if (message.role === 'assistant' && message.content) {
    return (
      <div className="flex gap-2 px-3 py-1.5">
        <div className="mt-0.5">
          <BotAvatar />
        </div>
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-bl-md bg-muted/60 px-3.5 py-2 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-1">
              <ToolBatch
                tools={message.toolCalls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
                  status: 'done' as const,
                }))}
                isComplete={true}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

// --- Collapsible Tool Batch ---

export interface ToolBatchItem {
  id: string
  name: string
  status: 'running' | 'done'
  description?: string
}

export interface ToolBatchProps {
  tools: ToolBatchItem[]
  isComplete: boolean
}

export function ToolBatch({ tools, isComplete }: ToolBatchProps) {
  const [isOpen, setIsOpen] = useState(false)
  const completedCount = tools.filter(t => t.status === 'done').length

  return (
    <div className="px-3 py-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
      >
        {isComplete ? (
          <CheckCircle2 className="h-3 w-3 text-green-500" />
        ) : (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        )}
        <span>
          {completedCount} actions completed
        </span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="mt-1 ml-2 space-y-0.5 border-l-2 border-border/40 pl-3">
          {tools.map(tool => (
            <div key={tool.id} className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
              {tool.status === 'done' ? (
                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
              )}
              <span className="truncate">{formatToolLabel(tool.name, tool.description)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Live Tool Status (for streaming) ---

export interface LiveToolStatusProps {
  statuses: ToolStatus[]
}

export function LiveToolStatus({ statuses }: LiveToolStatusProps) {
  if (statuses.length === 0) return null

  const completedCount = statuses.filter(t => t.status === 'done').length
  const currentTool = statuses.find(t => t.status === 'running')

  return (
    <div className="flex gap-2 px-3 py-1.5">
      <div className="mt-0.5">
        <BotAvatar />
      </div>
      <div className="flex-1 min-w-0">
        <div className="space-y-0.5 border-l-2 border-primary/30 pl-3 py-1">
          {statuses.map((ts, idx) => (
            <div key={ts.id} className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
              {ts.status === 'done' ? (
                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
              )}
              <span className="text-muted-foreground/50 w-4 text-right shrink-0">{idx + 1}.</span>
              <span className="truncate">
                {formatToolLabel(ts.name, ts.description)}
                {ts.status === 'running' ? '…' : ''}
              </span>
            </div>
          ))}
        </div>
        {currentTool && (
          <div className="mt-1 px-1 text-[10px] text-muted-foreground/40">
            Step {completedCount + 1} of {statuses.length}+
          </div>
        )}
      </div>
    </div>
  )
}
