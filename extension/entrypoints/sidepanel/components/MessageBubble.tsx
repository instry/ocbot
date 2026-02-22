import type { ChatMessage } from '../../../lib/types'
import { useState } from 'react'
import { ChevronDown, Loader2, CheckCircle2 } from 'lucide-react'
import { BotAvatar } from './BotAvatar'
import type { ToolStatus } from '../hooks/useChat'

interface MessageBubbleProps {
  message: ChatMessage
}

const TOOL_LABELS: Record<string, string> = {
  navigate: 'Navigating',
  click: 'Clicking element',
  type: 'Typing text',
  scroll: 'Scrolling page',
  getText: 'Reading page',
  getElements: 'Inspecting elements',
  waitForNavigation: 'Waiting for page load',
}

function formatToolName(name: string): string {
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

  // assistant message with only tool calls (no text) — render as tool batch
  if (message.role === 'assistant' && message.toolCalls?.length && !message.content) {
    return (
      <ToolBatch
        tools={message.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          status: 'done' as const,
        }))}
        isComplete={true}
      />
    )
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

interface ToolBatchItem {
  id: string
  name: string
  status: 'running' | 'done'
}

interface ToolBatchProps {
  tools: ToolBatchItem[]
  isComplete: boolean
}

function ToolBatch({ tools, isComplete }: ToolBatchProps) {
  const [isOpen, setIsOpen] = useState(false)
  const completedCount = tools.filter(t => t.status === 'done').length

  return (
    <div className="px-3 py-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
      >
        {isComplete ? (
          <CheckCircle2 className="h-3 w-3 text-green-500" />
        ) : (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        )}
        <span>
          {completedCount}/{tools.length} actions completed
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
              <span>{formatToolName(tool.name)}</span>
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
  const allDone = completedCount === statuses.length
  const currentTool = statuses.find(t => t.status === 'running')

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
        {allDone ? (
          <CheckCircle2 className="h-3 w-3 text-green-500" />
        ) : (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        )}
        <span>
          {currentTool
            ? formatToolName(currentTool.name) + '...'
            : `${completedCount}/${statuses.length} actions completed`
          }
        </span>
      </div>
    </div>
  )
}
