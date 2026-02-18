import { Sparkles } from 'lucide-react'

export function ChatArea() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="flex h-full flex-col items-center justify-center space-y-4 text-center px-4">
        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h2 className="mb-1 text-lg font-semibold">How can I help?</h2>
          <p className="text-xs text-muted-foreground max-w-[200px]">
            Ask questions about the current page or any topic
          </p>
        </div>
      </div>
    </main>
  )
}