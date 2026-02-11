import { Plus, Settings } from 'lucide-react'
import type { FC } from 'react'

interface ChatHeaderProps {
  onNewConversation: () => void
  onOpenSettings: () => void
}

export const ChatHeader: FC<ChatHeaderProps> = ({
  onNewConversation,
  onOpenSettings,
}) => {
  return (
    <header className="flex items-center justify-between border-b border-border/40 bg-background/80 px-3 py-2.5 backdrop-blur-md">
      <span className="text-sm font-semibold">ocbot</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewConversation}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          title="New conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
