import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Save, Check, Zap } from 'lucide-react'
import { getRealSkill, saveRealSkill, type RealSkill } from '../data/skills'
import { parseSkillMd } from '@/lib/skills/create'

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'border-green-500/30 bg-green-500/10 text-green-500',
    degraded: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    archived: 'border-red-500/30 bg-red-500/10 text-red-500',
  }
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.active}`}>
      {status}
    </span>
  )
}

export function SkillEditPage({ skillId, onBack }: {
  skillId: string
  onBack: () => void
}) {
  const [skill, setSkill] = useState<RealSkill | null>(null)
  const [saved, setSaved] = useState(false)
  const [skillMd, setSkillMd] = useState('')

  useEffect(() => {
    getRealSkill(skillId).then((s) => {
      if (!s) return
      setSkill(s)
      setSkillMd(s.skillMd)
    })
  }, [skillId])

  const handleSave = useCallback(async () => {
    if (!skill) return
    const fm = parseSkillMd(skillMd)
    const updated: RealSkill = {
      ...skill,
      skillMd,
      updatedAt: Date.now(),
      ...(fm && {
        name: fm.name,
        description: fm.description,
        parameters: fm.parameters,
        triggerPhrases: fm.triggerPhrases,
        startUrl: fm.startUrl,
        urlPattern: fm.urlPattern,
        categories: fm.categories,
        preconditions: fm.preconditions,
      }),
    }
    await saveRealSkill(updated)
    setSkill(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [skill, skillMd])

  const handleTest = useCallback(async () => {
    await chrome.storage.local.set({ ocbot_repair_skill: skillId })
    const { id: windowId } = await chrome.windows.getCurrent()
    await chrome.sidePanel.open({ windowId: windowId! })
  }, [skillId])

  if (!skill) return null

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <button
        onClick={onBack}
        className="flex cursor-pointer items-center gap-1.5 border-b border-border/40 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Skill
      </button>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={skill.status} />
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            Score: {(skill.score * 100).toFixed(0)}%
          </span>
          <span className="font-mono text-xs text-muted-foreground">v{skill.version}</span>
        </div>

        <textarea
          value={skillMd}
          onChange={(e) => setSkillMd(e.target.value)}
          className="min-h-[1000px] w-full rounded-lg border border-border/50 bg-card p-3 font-mono text-sm text-foreground outline-none focus:border-primary"
          placeholder="---&#10;name: my-skill&#10;description: What this skill does&#10;---&#10;&#10;# My Skill&#10;&#10;## Workflow&#10;1. First step"
        />

        <div className="flex items-center gap-3 border-t border-border/40 pt-4">
          <button
            onClick={handleSave}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={handleTest}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
          >
            <Zap className="h-4 w-4" />
            Test
          </button>
        </div>
      </div>
    </div>
  )
}
