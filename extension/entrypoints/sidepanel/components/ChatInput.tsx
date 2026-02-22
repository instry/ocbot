import { Send, Square } from 'lucide-react'
import { useState, useCallback } from 'react'

interface ChatInputProps {
  onSend: (text: string) => void
  onStop: () => void
  isLoading: boolean
  disabled: boolean
}

export function ChatInput({ onSend, onStop, isLoading, disabled }: ChatInputProps) {
  const [input, setInput] = useState('')

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (isLoading) {
      onStop()
      return
    }
    if (!input.trim() || disabled) return
    onSend(input.trim())
    setInput('')
  }, [input, isLoading, disabled, onSend, onStop])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <footer className="border-t border-border/40 bg-background/80 p-3 backdrop-blur-md">
      <form onSubmit={handleSubmit} className="relative flex w-full items-end gap-2">
        <textarea
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border/50 bg-muted/50 px-4 py-2.5 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me to complete a task..."
          rows={1}
          disabled={disabled}
        />
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className="absolute right-1.5 bottom-1.5 rounded-full bg-destructive p-2 text-destructive-foreground shadow-sm transition-all hover:bg-destructive/80"
            title="Stop"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || disabled}
            className="absolute right-1.5 bottom-1.5 rounded-full bg-primary p-2 text-primary-foreground shadow-sm transition-all hover:bg-primary/80 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </form>
    </footer>
  )
}
