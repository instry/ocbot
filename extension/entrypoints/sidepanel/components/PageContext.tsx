import { ChevronDown, ChevronRight, Globe } from 'lucide-react'
import { type FC, useState } from 'react'
import type { PageContent } from '@/lib/messaging'

interface PageContextProps {
  page: PageContent | null
}

export const PageContext: FC<PageContextProps> = ({ page }) => {
  const [expanded, setExpanded] = useState(false)

  if (!page) return null

  let hostname = ''
  try {
    hostname = new URL(page.url).hostname
  } catch {
    hostname = page.url
  }

  return (
    <div className="border-b border-border/40 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <Globe className="h-3 w-3 shrink-0" />
        <span className="truncate">{page.title || hostname}</span>
        {expanded ? (
          <ChevronDown className="ml-auto h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="ml-auto h-3 w-3 shrink-0" />
        )}
      </button>
      {expanded && (
        <p className="mt-1 text-xs text-muted-foreground/70 truncate">{page.url}</p>
      )}
    </div>
  )
}
