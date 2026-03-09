import { Menu, SquarePen, X, ArrowLeft } from 'lucide-react'

interface HeaderProps {
  view: 'chat' | 'history'
  onNewChat: () => void
  onToggleHistory: () => void
  onClose: () => void
}

export function Header({ view, onNewChat, onToggleHistory, onClose }: HeaderProps) {
  if (view === 'history') {
    return (
      <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-0.5">
          <button
            onClick={onToggleHistory}
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">History</span>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
    )
  }

  return (
    <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
      <div className="flex items-center gap-0.5">
        <button
          onClick={onToggleHistory}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="History"
        >
          <Menu className="h-4 w-4" />
        </button>
        <button
          onClick={onNewChat}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="New Session"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>
      <button
        onClick={onClose}
        className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        title="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  )
}
