import { Menu, SquarePen, X, ArrowLeft } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'

interface HeaderProps {
  view: 'chat' | 'history'
  onNewChat: () => void
  onToggleHistory: () => void
  onClose: () => void
}

export function Header({ view, onNewChat, onToggleHistory, onClose }: HeaderProps) {
  const { t } = useI18n()
  if (view === 'history') {
    return (
      <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-0.5">
          <button
            onClick={onToggleHistory}
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            title={t('common.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{t('nav.history')}</span>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title={t('common.close')}
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
          title={t('nav.history')}
        >
          <Menu className="h-4 w-4" />
        </button>
        <button
          onClick={onNewChat}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title={t('nav.newSession')}
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>
      <button
        onClick={onClose}
        className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        title={t('common.close')}
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  )
}
