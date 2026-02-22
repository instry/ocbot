import { Settings, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { LlmProvider } from '../../../lib/llm/types'
import { getTemplateByType } from '../../../lib/llm/models'

interface HeaderProps {
  selectedProvider: LlmProvider | null
  providers: LlmProvider[]
  onSelectProvider: (id: string) => void
  onOpenSettings: () => void
}

export function Header({ selectedProvider, providers, onSelectProvider, onOpenSettings }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getModelDisplayName = (provider: LlmProvider) => {
    const template = getTemplateByType(provider.type)
    const model = template?.models.find(m => m.id === provider.modelId)
    return model?.name ?? provider.modelId
  }

  return (
    <header className="flex items-center justify-between border-b border-border/40 px-3 py-2">
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => providers.length > 0 && setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-muted/80"
        >
          {selectedProvider ? (
            <>
              <span className="font-medium">{selectedProvider.name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{getModelDisplayName(selectedProvider)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No provider configured</span>
          )}
          {providers.length > 0 && <ChevronDown className="ml-0.5 h-3.5 w-3.5 text-muted-foreground" />}
        </button>

        {dropdownOpen && providers.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-lg">
            {providers.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelectProvider(p.id); setDropdownOpen(false) }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                  p.id === selectedProvider?.id ? 'bg-accent/50 font-medium' : ''
                }`}
              >
                <span>{p.name}</span>
                <span className="text-xs text-muted-foreground">{getModelDisplayName(p)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onOpenSettings}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
    </header>
  )
}
