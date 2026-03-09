import { useEffect, useRef, useMemo } from 'react'
import type { ChatMessage } from '@/lib/types'
import type { ToolStatus as ToolStatusType } from '@/lib/hooks/useChat'
import { MessageBubble, LiveToolStatus, ToolBatch } from '@/components/MessageBubble'
import { BotAvatar } from '@/components/BotAvatar'
import { WelcomeHero } from '@/components/WelcomeHero'

interface ChatAreaProps {
  hasProvider: boolean
  messages: ChatMessage[]
  streamingText: string
  isLoading: boolean
  toolStatuses: ToolStatusType[]
  error: string | null
}

function parseToolDescription(name: string, argsStr?: string): string | undefined {
  if (!argsStr) return undefined
  try {
    const args = JSON.parse(argsStr)
    if (name === 'act') return args.instruction || (args.method ? `${args.method} element` : undefined)
    if (name === 'navigate') {
      const url = args.url || ''
      return url.length > 50 ? url.slice(0, 50) + '…' : url
    }
    if (name === 'extract' || name === 'observe') return args.instruction
    if (name === 'scroll') return args.direction || 'down'
    if (name === 'think') return args.thought?.slice(0, 60)
    if (name === 'fillForm') return (args.fields || []).map((f: { field: string }) => f.field).join(', ')
  } catch { /* ignore */ }
  return undefined
}

export function ChatArea({ hasProvider, messages, streamingText, isLoading, toolStatuses, error }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolStatuses])

  // Group consecutive tool-only assistant messages into a single batch for display.
  // This prevents showing "1/1" for each turn — instead shows "n/n" consolidated.
  type RenderItem =
    | { type: 'message'; msg: ChatMessage }
    | { type: 'toolGroup'; id: string; tools: { id: string; name: string; status: 'done'; description?: string }[] }

  const renderItems = useMemo(() => {
    const items: RenderItem[] = []
    for (const msg of messages) {
      if (msg.role === 'tool') continue // tool results are hidden in UI
      if (msg.role === 'assistant' && msg.toolCalls?.length && !msg.content) {
        // Tool-only assistant message — merge into previous group or start new one
        const last = items[items.length - 1]
        const newTools = msg.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          status: 'done' as const,
          description: parseToolDescription(tc.name, tc.arguments),
        }))
        if (last?.type === 'toolGroup') {
          last.tools.push(...newTools)
        } else {
          items.push({
            type: 'toolGroup',
            id: msg.id,
            tools: newTools,
          })
        }
      } else {
        items.push({ type: 'message', msg })
      }
    }
    return items
  }, [messages])

  // Empty state
  if (messages.length === 0) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="flex h-full flex-col items-center justify-center space-y-4 text-center px-4">
          <WelcomeHero size="sm" />
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto py-2">
      {renderItems.map(item => {
        if (item.type === 'toolGroup') {
          // During loading, hide grouped batches — LiveToolStatus handles progress
          if (isLoading) return null
          return <ToolBatch key={item.id} tools={item.tools} isComplete={true} />
        }
        return <MessageBubble key={item.msg.id} message={item.msg} />
      })}

      {/* Live tool execution status */}
      {isLoading && toolStatuses.length > 0 && !streamingText && (
        <LiveToolStatus statuses={toolStatuses} />
      )}

      {/* Streaming text */}
      {streamingText && (
        <div className="flex gap-2 px-3 py-1.5">
          <div className="mt-0.5">
            <BotAvatar />
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted/60 px-3.5 py-2 text-sm whitespace-pre-wrap">
            {streamingText}
            <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
          </div>
        </div>
      )}

      {/* Loading dots */}
      {isLoading && !streamingText && toolStatuses.length === 0 && (
        <div className="flex gap-2 px-3 py-1.5">
          <div className="mt-0.5">
            <BotAvatar />
          </div>
          <div className="flex gap-1 px-3.5 py-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}

      {error && (
        <div className="mx-3 my-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div ref={bottomRef} />
    </main>
  )
}
