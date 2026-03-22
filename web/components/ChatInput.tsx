import { Send, Square, ChevronDown, Search, Check } from 'lucide-react'
import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useInputHistory } from '@/lib/hooks/useInputHistory'
import type { GatewayModel } from '@/lib/gateway/models'
import { useI18n } from '@/lib/i18n/context'

export interface ChatInputHandle {
  setInput: (text: string) => void
}

interface ChatInputProps {
  onSend: (text: string) => void
  onStop?: () => void
  isLoading?: boolean
  disabled?: boolean
  variant?: 'footer' | 'standalone' | 'centered'
  rows?: number
  minHeight?: string
  models?: GatewayModel[]
  selectedModel?: string | null
  onSelectModel?: (modelId: string) => void
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  onSend, onStop, isLoading = false, disabled = false, variant = 'footer',
  rows = 1, minHeight = 'min-h-[42px]',
  models, selectedModel, onSelectModel,
}, ref) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const { navigateUp, navigateDown, resetNavigation, addEntry } = useInputHistory()

  useImperativeHandle(ref, () => ({ setInput }), [])

  const showSelector = !!(models && onSelectModel)

  const selectedModelObj = useMemo(() => {
    if (!models || !selectedModel) return null
    return models.find(m => m.id === selectedModel) ?? null
  }, [models, selectedModel])

  useEffect(() => {
    if (!popoverOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [popoverOpen])

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    if (isLoading && onStop) { onStop(); return }
    if (!input.trim() || disabled) return
    addEntry(input.trim())
    resetNavigation()
    onSend(input.trim())
    setInput('')
  }, [input, isLoading, disabled, onSend, onStop, addEntry, resetNavigation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault(); handleSubmit(); return
    }
    const textarea = e.currentTarget
    if (e.key === 'ArrowUp') {
      const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0
      if (input === '' || atStart) {
        const prev = navigateUp(input)
        if (prev !== null) { e.preventDefault(); setInput(prev) }
      }
      return
    }
    if (e.key === 'ArrowDown') {
      const atEnd = textarea.selectionStart === input.length
      if (atEnd) {
        const next = navigateDown()
        if (next !== null) { e.preventDefault(); setInput(next) }
      }
    }
  }, [handleSubmit, input, navigateUp, navigateDown])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value); resetNavigation()
  }, [resetNavigation])

  const containerClasses = variant === 'footer'
    ? 'border-t border-border/40 bg-background/80 p-3 backdrop-blur-md'
    : 'w-full'

  return (
    <div className={containerClasses}>
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="w-full">
        <div className="rounded-2xl border border-border/50 bg-muted/50 shadow-sm transition-colors hover:border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <textarea
            className={`${minHeight} max-h-48 w-full resize-none rounded-t-2xl bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/70`}
            value={input} onChange={handleChange} onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')} rows={rows} disabled={disabled}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div>
              {showSelector && (
                <div ref={popoverRef} className="relative">
                  <button
                    type="button" onClick={() => setPopoverOpen(!popoverOpen)}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-muted"
                  >
                    {selectedModelObj ? (
                      <span className="font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                        {selectedModelObj.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('models.selectModel')}</span>
                    )}
                    <ChevronDown className="h-3 w-3 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                  </button>
                  {popoverOpen && (
                    <ModelPopover
                      models={models!}
                      selectedModel={selectedModel ?? null}
                      onSelect={(id) => { onSelectModel!(id); setPopoverOpen(false) }}
                      onClose={() => setPopoverOpen(false)}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isLoading && onStop ? (
                <button type="button" onClick={onStop} className="cursor-pointer rounded-full bg-destructive p-2 text-destructive-foreground shadow-sm transition-all hover:bg-destructive/80" title={t('common.stop')}>
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim() || disabled} className="cursor-pointer rounded-full bg-primary p-2 text-primary-foreground shadow-sm transition-all hover:bg-primary/80 disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  )
})

// ============================================================
// Model Popover (small, for selecting current model)
// ============================================================

function ModelPopover({ models, selectedModel, onSelect, onClose }: {
  models: GatewayModel[]
  selectedModel: string | null
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  useEffect(() => { requestAnimationFrame(() => searchRef.current?.focus()) }, [])

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim()
    const groups: { name: string; items: GatewayModel[] }[] = []
    for (const m of models) {
      const groupName = m.provider
      if (q && !groupName.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) continue
      let group = groups.find(g => g.name === groupName)
      if (!group) { group = { name: groupName, items: [] }; groups.push(group) }
      group.items.push(m)
    }
    return groups
  }, [models, search])

  return (
    <div
      className="absolute bottom-full left-0 mb-1.5 flex w-72 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
      style={{ maxHeight: '320px' }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('models.searchModels')} className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50" />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {grouped.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {models.length === 0 ? (
              <span>{t('models.noModelsConfigured')}</span>
            ) : t('models.noModelsFound')}
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.name}>
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{group.name}</div>
              {group.items.map(m => {
                const isSelected = selectedModel === m.id
                return (
                  <button key={m.id} type="button" onClick={() => onSelect(m.id)}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    <span className={`flex-1 truncate ${isSelected ? 'font-medium' : ''}`}>{m.name}</span>
                    {isSelected && <Check className="h-3 w-3 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
