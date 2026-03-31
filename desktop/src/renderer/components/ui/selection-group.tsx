import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SelectionOption<T extends string = string> {
  value: T
  label: string
  description?: string
  icon?: ReactNode
  badge?: string
}

interface SelectionGroupProps<T extends string = string> {
  value: T
  options: Array<SelectionOption<T>>
  onChange: (value: T) => void
  size?: 'compact' | 'comfortable'
  className?: string
}

export function SelectionGroup<T extends string = string>({
  value,
  options,
  onChange,
  size = 'comfortable',
  className,
}: SelectionGroupProps<T>) {
  return (
    <div
      className={cn(
        'grid gap-2 rounded-2xl border border-border bg-card/80 p-2 shadow-sm backdrop-blur-sm',
        options.length <= 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        const hasDescription = Boolean(option.description)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={cn(
              'group flex w-full gap-3 rounded-xl border text-left transition-all duration-150',
              hasDescription ? 'items-start' : 'items-center',
              size === 'compact' ? 'min-h-[52px] px-3 py-2.5' : 'min-h-[64px] px-3.5 py-3',
              selected
                ? 'border-button-tonal-border bg-button-tonal text-button-tonal-foreground shadow-sm'
                : 'border-transparent bg-transparent text-text hover:border-border hover:bg-bg-hover/80',
            )}
          >
            <span
              className={cn(
                'flex shrink-0 items-center justify-center rounded-xl border transition-colors',
                hasDescription && 'mt-0.5',
                size === 'compact' ? 'h-7 w-7' : 'h-8 w-8',
                selected
                  ? 'border-button-tonal-border bg-card text-button-tonal-foreground'
                  : 'border-border bg-bg text-muted-foreground group-hover:text-text-strong',
              )}
            >
              {option.icon ?? (selected ? <Check className="h-4 w-4" /> : null)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={cn('truncate font-medium', size === 'compact' ? 'text-[13px]' : 'text-sm')}>
                  {option.label}
                </span>
                {option.badge ? (
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      selected
                        ? 'border-button-tonal-border bg-card text-button-tonal-foreground'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {option.badge}
                  </span>
                ) : null}
              </span>
              {option.description ? (
                <span
                  className={cn(
                    'mt-0.5 block leading-[18px]',
                    size === 'compact' ? 'text-[11px]' : 'text-xs',
                    selected ? 'text-button-tonal-foreground/90' : 'text-muted-foreground',
                  )}
                >
                  {option.description}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
