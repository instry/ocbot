import { useState } from 'react'
import { Play, X } from 'lucide-react'
import type { Skill, SkillParameter } from '@/lib/skills/types'

interface SkillParamFormProps {
  skill: Skill
  prefill?: Record<string, string>
  onConfirm: (params: Record<string, string>) => void
  onCancel: () => void
}

function defaultValue(param: SkillParameter): string {
  if (param.default != null) return String(param.default)
  if (param.type === 'boolean') return 'false'
  if (param.type === 'select' && param.options?.length) return param.options[0]
  return ''
}

export function SkillParamForm({ skill, prefill, onConfirm, onCancel }: SkillParamFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const p of skill.parameters) {
      init[p.name] = prefill?.[p.name] ?? defaultValue(p)
    }
    return init
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm(values)
  }

  return (
    <div className="mx-3 my-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
      <div className="mb-2 text-sm font-medium">{skill.name}</div>
      {skill.description && (
        <div className="mb-3 text-xs text-muted-foreground">{skill.description}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-2.5">
        {skill.parameters.map(param => (
          <div key={param.name}>
            <label className="mb-0.5 block text-xs font-medium">
              {param.name}
              {param.required && <span className="ml-0.5 text-destructive">*</span>}
            </label>
            {param.description && (
              <div className="mb-1 text-[11px] text-muted-foreground">{param.description}</div>
            )}
            {param.type === 'select' && param.options ? (
              <select
                value={values[param.name] ?? ''}
                onChange={e => setValues(v => ({ ...v, [param.name]: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                {param.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : param.type === 'boolean' ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values[param.name] === 'true'}
                  onChange={e => setValues(v => ({ ...v, [param.name]: String(e.target.checked) }))}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">{values[param.name] === 'true' ? 'Yes' : 'No'}</span>
              </label>
            ) : (
              <input
                type={param.type === 'number' ? 'number' : 'text'}
                value={values[param.name] ?? ''}
                onChange={e => setValues(v => ({ ...v, [param.name]: e.target.value }))}
                placeholder={param.description}
                required={param.required}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Play className="h-3 w-3" />
            Run
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
