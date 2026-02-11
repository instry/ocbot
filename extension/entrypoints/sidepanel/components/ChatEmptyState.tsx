import { Sparkles } from 'lucide-react'
import type { FC } from 'react'

const SUGGESTIONS = [
  { display: 'Summarize this page', prompt: 'Summarize the current page in bullet points.' },
  { display: 'What is this page about?', prompt: 'Briefly describe what this page is about.' },
  { display: 'Extract key points', prompt: 'Extract the key points from the current page.' },
]

interface ChatEmptyStateProps {
  onSuggestionClick: (prompt: string) => void
}

export const ChatEmptyState: FC<ChatEmptyStateProps> = ({ onSuggestionClick }) => {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4 text-center">
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h2 className="mb-1 text-lg font-semibold">How can I help?</h2>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          Ask questions about the current page or any topic
        </p>
      </div>
      <div className="mt-6 grid w-full max-w-[260px] grid-cols-1 gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            type="button"
            key={s.display}
            onClick={() => onSuggestionClick(s.prompt)}
            className="rounded-lg border border-border/50 bg-card px-3 py-2.5 text-left text-xs transition-all hover:border-primary/50 hover:bg-primary/5"
          >
            {s.display}
          </button>
        ))}
      </div>
    </div>
  )
}
