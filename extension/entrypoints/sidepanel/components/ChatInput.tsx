import { Send, Square } from 'lucide-react'
import { type FC, type FormEvent, type KeyboardEvent, useRef } from 'react'

interface ChatInputProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  isStreaming: boolean
  onStop: () => void
}

export const ChatInput: FC<ChatInputProps> = ({
  input,
  onInputChange,
  onSubmit,
  isStreaming,
  onStop,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (input.trim()) {
        e.currentTarget.form?.requestSubmit()
      }
    }
  }

  return (
    <footer className="border-t border-border/40 bg-background/80 p-3 backdrop-blur-md">
      <form onSubmit={onSubmit} className="relative flex w-full items-end gap-2">
        <textarea
          ref={textareaRef}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border/50 bg-muted/50 px-4 py-2.5 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary field-sizing-content"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this page..."
          rows={1}
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="absolute right-1.5 bottom-1.5 rounded-full bg-destructive p-2 text-white shadow-sm transition-all hover:bg-destructive/80"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-1.5 bottom-1.5 rounded-full bg-primary p-2 text-primary-foreground shadow-sm transition-all hover:bg-primary/80 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </form>
    </footer>
  )
}
