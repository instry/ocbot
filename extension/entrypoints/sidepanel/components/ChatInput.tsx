import { Send, Square } from 'lucide-react'
import { useState, useCallback } from 'react'
import { useInputHistory } from '../hooks/useInputHistory'

interface ChatInputProps {
  onSend: (text: string) => void
  onStop: () => void
  isLoading: boolean
  disabled: boolean
}

export function ChatInput({ onSend, onStop, isLoading, disabled }: ChatInputProps) {
  const [input, setInput] = useState('')
  const { navigateUp, navigateDown, resetNavigation, addEntry } = useInputHistory()

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (isLoading) {
      onStop()
      return
    }
    if (!input.trim() || disabled) return
    addEntry(input.trim())
    resetNavigation()
    onSend(input.trim())
    setInput('')
  }, [input, isLoading, disabled, onSend, onStop, addEntry, resetNavigation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      handleSubmit()
      return
    }

    const textarea = e.currentTarget

    if (e.key === 'ArrowUp') {
      // Only intercept when cursor is at the start or input is empty
      const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0
      if (input === '' || atStart) {
        const prev = navigateUp(input)
        if (prev !== null) {
          e.preventDefault()
          setInput(prev)
        }
      }
      return
    }

    if (e.key === 'ArrowDown') {
      // Only intercept when cursor is at the end
      const atEnd = textarea.selectionStart === input.length
      if (atEnd) {
        const next = navigateDown()
        if (next !== null) {
          e.preventDefault()
          setInput(next)
        }
      }
      return
    }
  }, [handleSubmit, input, navigateUp, navigateDown])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    resetNavigation()
  }, [resetNavigation])

  return (
    <footer className="border-t border-border/40 bg-background/80 p-3 backdrop-blur-md">
      <form onSubmit={handleSubmit} className="relative flex w-full items-end gap-2">
        <textarea
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border/50 bg-muted/50 px-4 py-2.5 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary"
          value={input}
          onChange={handleChange}
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
