import { Settings, Sparkles } from 'lucide-react'

interface ChatAreaProps {
  hasProvider: boolean
  onOpenSettings: () => void
}

export function ChatArea({ hasProvider, onOpenSettings }: ChatAreaProps) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="flex h-full flex-col items-center justify-center space-y-4 text-center px-4">
        {hasProvider ? (
          <>
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="mb-1 text-lg font-semibold">How can I help?</h2>
              <p className="text-xs text-muted-foreground max-w-[200px]">
                I can browse the web, find information, and complete tasks for you
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
              <Settings className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className="mb-1 text-lg font-semibold">Set up a provider</h2>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                Add an LLM provider to start chatting
              </p>
            </div>
            <button
              onClick={onOpenSettings}
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Go to Settings
            </button>
          </>
        )}
      </div>
    </main>
  )
}
