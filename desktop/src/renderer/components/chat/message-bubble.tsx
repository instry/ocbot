import { memo, useCallback } from 'react'
import { Copy } from 'lucide-react'
import { MarkdownContent } from './markdown-content'
import { ToolCard } from './tool-card'
import { cn } from '@/lib/utils'
import type { ChatMessage, ToolCard as ToolCardType } from '@/types/chat'
import { messageText, formatTime } from '@/types/chat'

interface MessageBubbleProps {
  message: ChatMessage
  isGroupStart: boolean
  toolCards?: ToolCardType[]
  isStreaming?: boolean
  streamText?: string
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isGroupStart,
  toolCards,
  isStreaming,
  streamText,
}: MessageBubbleProps) {
  const text = messageText(message)
  const time = formatTime(message.timestamp)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {})
  }, [text])

  if (message.role === 'user') {
    return (
      <div className="cv-msg flex justify-end">
        <div className="max-w-[75%]">
          <div className="rounded-[18px_18px_4px_18px] bg-accent-subtle px-4 py-2.5 text-[14px] leading-relaxed text-text whitespace-pre-wrap">
            {text}
          </div>
          {time && (
            <div className="mt-1 text-right text-[11px] text-muted-foreground/60">{time}</div>
          )}
        </div>
      </div>
    )
  }

  // Assistant message
  const displayText = isStreaming ? (streamText ?? text) : text

  return (
    <div className={cn('cv-msg', isGroupStart && 'mt-4')}>
      {isGroupStart && (
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-subtle">
            <img src="./logo.png" alt="" className="h-5 w-5" />
          </div>
          <span className="text-[13px] font-semibold text-text-strong">Ocbot</span>
          {time && <span className="text-[11px] text-muted-foreground">{time}</span>}
        </div>
      )}
      <div className="group relative pl-9">
        <div className="text-[14px] leading-relaxed text-chat-text">
          {displayText ? (
            <MarkdownContent content={displayText} />
          ) : null}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-[2px] animate-[blink_1s_steps(1)_infinite] bg-accent align-text-bottom" />
          )}
        </div>
        {!isStreaming && text && (
          <button
            onClick={handleCopy}
            className="absolute -right-7 top-0 flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Tool cards */}
      {toolCards && toolCards.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 pl-9">
          {toolCards.map(tc => (
            <ToolCard key={tc.id} tool={tc} />
          ))}
        </div>
      )}
    </div>
  )
})
