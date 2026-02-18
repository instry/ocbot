import { Send } from 'lucide-react'
import { useState } from 'react'

export function ChatInput() {
  const [input, setInput] = useState('')

  return (
    <footer className="border-t border-border/40 bg-background/80 p-3 backdrop-blur-md">
      <form className="relative flex w-full items-end gap-2">
        <textarea
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border/50 bg-muted/50 px-4 py-2.5 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this page..."
          rows={1}
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="absolute right-1.5 bottom-1.5 rounded-full bg-primary p-2 text-primary-foreground shadow-sm transition-all hover:bg-primary/80 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </footer>
  )
}