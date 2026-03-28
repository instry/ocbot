import { useEffect, useRef } from 'react'
import { MessageBubble } from './message-bubble'
import { useChatStore } from '@/stores/chat-store'

export function MessageList() {
  const messages = useChatStore(s => s.messages)
  const isLoadingHistory = useChatStore(s => s.isLoadingHistory)
  const streamText = useChatStore(s => s.streamText)
  const sending = useChatStore(s => s.sending)
  const toolCards = useChatStore(s => s.toolCards)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isStreaming = sending || !!streamText

  // Auto-scroll to bottom
  useEffect(() => {
    const el = bottomRef.current
    const container = scrollRef.current
    if (!el || !container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150

    if (isNearBottom || isStreaming) {
      el.scrollIntoView({ behavior: isStreaming ? 'instant' : 'smooth' })
    }
  }, [messages, streamText, toolCards, isStreaming])

  const hasMessages = messages.length > 0 || !!streamText

  if (isLoadingHistory) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="h-3 w-16 animate-shimmer rounded bg-bg-muted" />
            <div className="h-14 w-3/4 animate-shimmer rounded-lg bg-bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (!hasMessages) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 animate-fade-in">
        <img src="./logo.png" alt="Ocbot" className="h-14 w-14 opacity-80" />
        <span className="text-lg font-medium text-text-strong">How can I help?</span>
      </div>
    )
  }

  // Collect tool cards as array
  const toolCardArray = toolCards instanceof Map ? [...toolCards.values()] : []

  return (
    <div ref={scrollRef} className="no-drag flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-1 px-6 py-4">
        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null
          const isGroupStart = !prev || prev.role !== msg.role
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isGroupStart={isGroupStart}
            />
          )
        })}

        {/* Tool cards during streaming */}
        {toolCardArray.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-subtle">
                <img src="./logo.png" alt="" className="h-5 w-5" />
              </div>
              <span className="text-[13px] font-semibold text-text-strong">Ocbot</span>
            </div>
            <div className="flex flex-col gap-1 pl-9">
              {toolCardArray.map(tc => (
                <ToolCardInList key={tc.id} tool={tc} />
              ))}
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {sending && !streamText && toolCardArray.length === 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-subtle">
                <img src="./logo.png" alt="" className="h-5 w-5" />
              </div>
              <span className="text-[13px] font-semibold text-text-strong">Ocbot</span>
            </div>
            <div className="flex gap-1 pl-9 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-[thinking-bounce_1.4s_ease-in-out_infinite]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-[thinking-bounce_1.4s_ease-in-out_infinite_0.16s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-[thinking-bounce_1.4s_ease-in-out_infinite_0.32s]" />
            </div>
          </div>
        )}

        {/* Streaming text */}
        {streamText && (
          <MessageBubble
            message={{
              id: '__streaming__',
              role: 'assistant',
              content: streamText,
              timestamp: Date.now(),
            }}
            isGroupStart={true}
            isStreaming={true}
            streamText={streamText}
          />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// Import ToolCard here to avoid circular deps
import { ToolCard as ToolCardComponent } from './tool-card'
import type { ToolCard as ToolCardType } from '@/types/chat'

function ToolCardInList({ tool }: { tool: ToolCardType }) {
  return <ToolCardComponent tool={tool} />
}
