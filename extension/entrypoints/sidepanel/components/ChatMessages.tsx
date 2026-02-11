import { Bot, User } from 'lucide-react'
import { type FC, useEffect, useRef } from 'react'
import type { ChatMessage } from '@/lib/types'

interface ChatMessagesProps {
  messages: ChatMessage[]
  streamingContent: string | null
}

export const ChatMessages: FC<ChatMessagesProps> = ({ messages, streamingContent }) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
      {messages.map((msg) => (
        <div key={msg.id} className="flex gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            {msg.role === 'user' ? (
              <User className="h-3.5 w-3.5" />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
          </div>
        </div>
      ))}
      {streamingContent !== null && (
        <div className="flex gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {streamingContent || (
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </span>
            )}
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
