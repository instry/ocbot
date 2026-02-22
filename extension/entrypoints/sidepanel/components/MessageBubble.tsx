import type { ChatMessage } from '../../../lib/types'
import { Bot, User, Wrench } from 'lucide-react'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-2 px-3 py-1.5">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return (
      <div className="flex gap-2 px-3 py-1">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
          <Wrench className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="max-w-[85%] rounded-xl bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground font-mono">
          <span className="font-semibold text-foreground/70">{message.toolResult?.name}</span>
          <div className="mt-0.5 line-clamp-3 break-all">{message.content}</div>
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div className="flex gap-2 px-3 py-1.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="max-w-[85%]">
        {message.content && (
          <div className="rounded-2xl rounded-bl-md bg-muted/60 px-3.5 py-2 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && !message.content && (
          <div className="text-xs text-muted-foreground italic">
            Using {message.toolCalls.map(tc => tc.name).join(', ')}...
          </div>
        )}
      </div>
    </div>
  )
}
