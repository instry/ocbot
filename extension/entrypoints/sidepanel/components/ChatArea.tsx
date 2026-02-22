import { Settings } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../../../lib/types'
import type { ToolStatus as ToolStatusType } from '../hooks/useChat'
import { MessageBubble, LiveToolStatus } from './MessageBubble'
import { BotAvatar } from './BotAvatar'

interface ChatAreaProps {
  hasProvider: boolean
  onOpenSettings: () => void
  messages: ChatMessage[]
  streamingText: string
  isLoading: boolean
  toolStatuses: ToolStatusType[]
  error: string | null
}

export function ChatArea({ hasProvider, onOpenSettings, messages, streamingText, isLoading, toolStatuses, error }: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, toolStatuses])

  // Empty state
  if (messages.length === 0) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="flex h-full flex-col items-center justify-center space-y-4 text-center px-4">
          {hasProvider ? (
            <>
              <div className="mb-2">
                <BotAvatar size="lg" />
              </div>
              <div>
                <h2 className="mb-1 text-lg font-semibold">How can I help?</h2>
                <p className="text-xs text-muted-foreground max-w-[200px]">
                  I can browse the web, find information, and complete tasks for you
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
                <Settings className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <h2 className="mb-1 text-lg font-semibold">Set up a provider</h2>
                <p className="text-xs text-muted-foreground max-w-[220px]">
                  Add an LLM provider to start chatting
                </p>
              </div>
              <button
                onClick={onOpenSettings}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              >
                Go to Settings
              </button>
            </>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto py-2">
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

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
