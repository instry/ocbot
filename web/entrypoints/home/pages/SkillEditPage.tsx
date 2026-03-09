import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, Save, Play, Trash2, AlertTriangle, Check, Clock, Zap,
  Activity, Plus, X,
} from 'lucide-react'
import {
  getRealSkill, saveRealSkill, getSkillExecutions, getSkillFragility,
  deleteLocalSkill, type RealSkill, type RealSkillExecution, type StepFragility,
} from '../data/skills'
import type { SkillParameter } from '@/lib/skills/types'

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

function FragilityIndicator({ fragility }: { fragility?: StepFragility }) {
  if (!fragility) return <span className="h-2 w-2 rounded-full bg-green-500" />
  if (fragility.fragile) return <span className="h-2 w-2 rounded-full bg-red-500" title={`Heal rate: ${(fragility.healFrequency * 100).toFixed(0)}%`} />
  if (fragility.healFrequency > 0.2) return <span className="h-2 w-2 rounded-full bg-amber-500" title={`Heal rate: ${(fragility.healFrequency * 100).toFixed(0)}%`} />
  return <span className="h-2 w-2 rounded-full bg-green-500" />
}

export function SkillEditPage({ skillId, onBack, onDeleted }: {
  skillId: string
  onBack: () => void
  onDeleted?: () => void
}) {
  const [skill, setSkill] = useState<RealSkill | null>(null)
  const [executions, setExecutions] = useState<RealSkillExecution[]>([])
  const [fragility, setFragility] = useState<StepFragility[]>([])
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Editable fields
  const [name, setName] = useState('')
  const [skillMd, setSkillMd] = useState('')
  const [parameters, setParameters] = useState<SkillParameter[]>([])

  useEffect(() => {
    getRealSkill(skillId).then((s) => {
      if (!s) return
      setSkill(s)
      setName(s.name)
      setSkillMd(s.skillMd)
      setParameters(s.parameters)
    })
    getSkillExecutions(skillId).then((e) => setExecutions(e.slice(0, 20)))
    getSkillFragility(skillId).then(setFragility)
  }, [skillId])

  const handleSave = useCallback(async () => {
    if (!skill) return
    const updated: RealSkill = {
      ...skill,
      name,
      skillMd,
      parameters,
      updatedAt: Date.now(),
    }
    await saveRealSkill(updated)
    setSkill(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [skill, name, skillMd, parameters])

  const handleDelete = useCallback(async () => {
    await deleteLocalSkill(skillId)
    onDeleted?.()
    onBack()
  }, [skillId, onBack, onDeleted])

  const handleRepair = useCallback(async () => {
    await chrome.storage.local.set({ ocbot_repair_skill: skillId })
    const { id: windowId } = await chrome.windows.getCurrent()
    await chrome.sidePanel.open({ windowId: windowId! })
  }, [skillId])

  const addParameter = useCallback(() => {
    setParameters((prev) => [
      ...prev,
      { name: '', type: 'string', description: '', required: false },
    ])
  }, [])

  const updateParameter = useCallback((index: number, updates: Partial<SkillParameter>) => {
    setParameters((prev) => prev.map((p, i) => (i === index ? { ...p, ...updates } : p)))
  }, [])

  const removeParameter = useCallback((index: number) => {
    setParameters((prev) => prev.filter((_, i) => i !== index))
  }, [])

  if (!skill) return null

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex cursor-pointer items-center gap-1.5 border-b border-border/40 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Skill
      </button>

      <div className="flex flex-col gap-6 p-6">
        {/* Header: Editable name, status badge, score */}
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-border/50 bg-card px-3 py-2 text-lg font-semibold text-foreground outline-none focus:border-primary"
          />
          <StatusBadge status={skill.status} />
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            Score: {(skill.score * 100).toFixed(0)}%
          </span>
          <span className="font-mono text-xs text-muted-foreground">v{skill.version}</span>
        </div>

        {/* SKILL.md Editor */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">SKILL.md</h2>
          <textarea
            value={skillMd}
            onChange={(e) => setSkillMd(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-border/50 bg-card p-3 font-mono text-sm text-foreground outline-none focus:border-primary"
            placeholder="Skill description in markdown..."
          />
        </section>

        {/* Parameters Editor */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Parameters</h2>
            <button
              onClick={addParameter}
              className="flex cursor-pointer items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {parameters.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/40">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Required</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Default</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {parameters.map((param, i) => (
                    <tr key={i} className={i < parameters.length - 1 ? 'border-b border-border/30' : ''}>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={param.name}
                          onChange={(e) => updateParameter(i, { name: e.target.value })}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs text-foreground outline-none focus:border-border"
                          placeholder="paramName"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={param.type}
                          onChange={(e) => updateParameter(i, { type: e.target.value as SkillParameter['type'] })}
                          className="rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground outline-none focus:border-border"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="select">select</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={param.required}
                          onChange={(e) => updateParameter(i, { required: e.target.checked })}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={param.default !== undefined ? String(param.default) : ''}
                          onChange={(e) => updateParameter(i, { default: e.target.value || undefined })}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs text-muted-foreground outline-none focus:border-border"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={param.description}
                          onChange={(e) => updateParameter(i, { description: e.target.value })}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground outline-none focus:border-border"
                          placeholder="Description..."
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => removeParameter(i)}
                          className="cursor-pointer text-muted-foreground/50 transition-colors hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60">No parameters defined.</p>
          )}
        </section>

        {/* Steps Viewer (read-only) */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Steps ({skill.steps.length})
          </h2>
          {skill.steps.length > 0 ? (
            <div className="flex flex-col gap-1">
              {skill.steps.map((step, i) => {
                const stepFragility = fragility.find((f) => f.stepIndex === i)
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-border/30 bg-card px-3 py-2 text-sm"
                  >
                    <FragilityIndicator fragility={stepFragility} />
                    <span className="font-mono text-xs text-muted-foreground/60">{i + 1}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {step.type}
                    </span>
                    <span className="flex-1 truncate text-foreground/80">
                      {step.type === 'act' ? step.instruction :
                       step.type === 'navigate' ? step.url :
                       step.type === 'fillForm' ? `${step.fields.length} fields` :
                       step.type === 'scroll' ? step.direction :
                       step.type}
                    </span>
                    {stepFragility?.fragile && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60">No cached steps. Run the skill to generate steps.</p>
          )}
        </section>

        {/* Execution History */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Execution History ({executions.length})
          </h2>
          {executions.length > 0 ? (
            <div className="flex flex-col gap-1">
              {executions.map((exec) => (
                <div
                  key={exec.id}
                  className="flex items-center gap-3 rounded-lg border border-border/30 bg-card px-3 py-2 text-xs"
                >
                  {exec.success ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  ) : (
                    <X className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  )}
                  <span className="text-muted-foreground">
                    {new Date(exec.timestamp).toLocaleString()}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 font-mono ${
                    exec.track === 'fast' ? 'bg-blue-500/10 text-blue-500' :
                    exec.track === 'agent' ? 'bg-purple-500/10 text-purple-500' :
                    'bg-amber-500/10 text-amber-500'
                  }`}>
                    {exec.track}
                  </span>
                  {exec.healEvents.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-500">
                      <Activity className="h-3 w-3" />
                      {exec.healEvents.length} heals
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {(exec.durationMs / 1000).toFixed(1)}s
                  </span>
                  <span className="text-muted-foreground/60">
                    {exec.completedSteps}/{exec.totalSteps} steps
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60">No executions yet.</p>
          )}
        </section>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border/40 pt-4">
          <button
            onClick={handleSave}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={handleRepair}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
          >
            <Zap className="h-4 w-4" />
            Repair
          </button>
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-red-500/30 px-5 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-500">Delete this skill?</span>
              <button
                onClick={handleDelete}
                className="flex cursor-pointer items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                <Trash2 className="h-4 w-4" />
                Confirm
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
