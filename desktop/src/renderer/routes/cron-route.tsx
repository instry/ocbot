import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { useGatewayStore } from '@/stores/gateway-store'
import { useUIStore } from '@/stores/ui-store'
import { PrimaryActionButton } from '@/components/ui/primary-action-button'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface CronSchedule {
  kind: 'cron' | 'every' | 'at'
  expr?: string
  tz?: string
  everyMs?: number
  at?: string
}

interface CronPayload {
  kind: 'agentTurn' | 'systemEvent'
  message?: string
  text?: string
}

interface CronJobState {
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastRunStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
}

interface CronJob {
  id: string
  name: string
  description?: string
  enabled: boolean
  schedule: CronSchedule
  payload: CronPayload
  delivery?: CronDelivery
  state: CronJobState
}

interface CronRunEntry {
  jobId: string
  ranAtMs: number
  status: 'ok' | 'error' | 'skipped'
  error?: string
  summary?: string
  durationMs?: number
}

type FormMode = 'create' | 'edit'
type SimpleScheduleMode = 'daily' | 'weekdays' | 'weekly' | 'every-hours' | 'every-days' | 'once' | 'advanced'
type CronDeliveryMode = 'announce' | 'silent' | 'none'

interface CronDelivery {
  mode?: CronDeliveryMode | string
  channel?: string
  to?: string
  accountId?: string
  bestEffort?: boolean
}

const WEEKDAY_OPTIONS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
] as const

const SCHEDULE_PILLS: Array<{ value: SimpleScheduleMode; label: string }> = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every-hours', label: 'Every N hours' },
  { value: 'every-days', label: 'Every N days' },
  { value: 'once', label: 'One time' },
  { value: 'advanced', label: 'Advanced' },
]

const DELIVERY_MODE_OPTIONS: Array<{ value: CronDeliveryMode; label: string; description: string }> = [
  { value: 'none', label: 'Off', description: 'Run the automation without sending the result to a chat.' },
  { value: 'announce', label: 'Send reply', description: 'Deliver the final reply to a channel target after the run completes.' },
  { value: 'silent', label: 'Silent', description: 'Keep delivery disabled while preserving the automation run.' },
]

function normalizeDeliveryMode(value: unknown): CronDeliveryMode {
  return value === 'announce' || value === 'silent' || value === 'none' ? value : 'none'
}

function getDeliveryTargetPlaceholder(channel: string): string {
  switch (channel) {
    case 'feishu':
      return 'user:ou_xxx 或 chat:oc_xxx'
    case 'telegram':
      return '123456789 或 @username'
    case 'discord':
      return 'channel:123456789 或 user:123456789'
    case 'slack':
      return 'channel:C12345678 或 user:U12345678'
    default:
      return '输入聊天目标'
  }
}

export function CronRoute() {
  const client = useGatewayStore(s => s.client)
  const setTab = useUIStore(s => s.setTab)

  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<FormMode>('edit')
  const [formName, setFormName] = useState('')
  const [formScheduleMode, setFormScheduleMode] = useState<SimpleScheduleMode>('daily')
  const [formTime, setFormTime] = useState('09:00')
  const [formWeekday, setFormWeekday] = useState('1')
  const [formEveryValue, setFormEveryValue] = useState('1')
  const [formDateTime, setFormDateTime] = useState('')
  const [formAdvancedCron, setFormAdvancedCron] = useState('0 9 * * *')
  const [formMessage, setFormMessage] = useState('')
  const [formDeliveryMode, setFormDeliveryMode] = useState<CronDeliveryMode>('none')
  const [formDeliveryChannel, setFormDeliveryChannel] = useState('feishu')
  const [formDeliveryTarget, setFormDeliveryTarget] = useState('')
  const [formDeliveryAccountId, setFormDeliveryAccountId] = useState('')
  const [formDeliveryBestEffort, setFormDeliveryBestEffort] = useState(true)
  const [formSaving, setFormSaving] = useState(false)

  const [panelOpen, setPanelOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [runs, setRuns] = useState<CronRunEntry[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const currentJob = useMemo(
    () => jobs.find(job => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  )

  useEffect(() => {
    setTab('cron')
  }, [setTab])

  useEffect(() => {
    if (!client) return

    let active = true

    const loadJobs = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await client.call<{ jobs?: CronJob[] }>('cron.list', {
          includeDisabled: true,
        })
        if (!active) return
        setJobs(result?.jobs ?? [])
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadJobs()

    const unsubscribe = client.onEvent((event) => {
      if (event === 'cron') {
        void loadJobs()
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [client])

  const loadJobs = async () => {
    if (!client) return
    setLoading(true)
    setError(null)
    try {
      const result = await client.call<{ jobs?: CronJob[] }>('cron.list', {
        includeDisabled: true,
      })
      setJobs(result?.jobs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const loadRuns = async (jobId: string) => {
    if (!client) return
    setRunsLoading(true)
    try {
      const result = await client.call<{ entries?: CronRunEntry[] }>('cron.runs', {
        id: jobId,
        limit: 10,
        sortDir: 'desc',
      })
      setRuns(result?.entries ?? [])
    } catch {
      setRuns([])
    } finally {
      setRunsLoading(false)
    }
  }

  const closePanel = () => {
    setPanelOpen(false)
    setSelectedJobId(null)
    setFormSaving(false)
    setConfirmDelete(false)
    setHistoryOpen(false)
    setRuns([])
  }

  const toLocalDateTimeInputValue = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const applyScheduleToForm = (schedule?: CronSchedule) => {
    setFormScheduleMode('daily')
    setFormTime('09:00')
    setFormWeekday('1')
    setFormEveryValue('1')
    setFormDateTime(toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)))
    setFormAdvancedCron('0 9 * * *')

    if (!schedule) return

    if (schedule.kind === 'at' && schedule.at) {
      setFormScheduleMode('once')
      setFormDateTime(toLocalDateTimeInputValue(new Date(schedule.at)))
      return
    }

    if (schedule.kind === 'every') {
      const ms = schedule.everyMs ?? 0
      if (ms >= 86400000 && ms % 86400000 === 0) {
        setFormScheduleMode('every-days')
        setFormEveryValue(String(ms / 86400000))
        return
      }
      setFormScheduleMode('every-hours')
      setFormEveryValue(String(Math.max(ms / 3600000, 1)))
      return
    }

    if (schedule.kind === 'cron') {
      const expr = schedule.expr?.trim() ?? ''
      setFormAdvancedCron(expr || '0 9 * * *')

      const daily = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
      if (daily) {
        setFormScheduleMode('daily')
        setFormTime(`${String(Number(daily[2])).padStart(2, '0')}:${String(Number(daily[1])).padStart(2, '0')}`)
        return
      }

      const weekdays = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(1-5|1,2,3,4,5)$/)
      if (weekdays) {
        setFormScheduleMode('weekdays')
        setFormTime(`${String(Number(weekdays[2])).padStart(2, '0')}:${String(Number(weekdays[1])).padStart(2, '0')}`)
        return
      }

      const weekly = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-6])$/)
      if (weekly) {
        setFormScheduleMode('weekly')
        setFormWeekday(weekly[3])
        setFormTime(`${String(Number(weekly[2])).padStart(2, '0')}:${String(Number(weekly[1])).padStart(2, '0')}`)
        return
      }

      setFormScheduleMode('advanced')
    }
  }

  const applyDeliveryToForm = (delivery?: CronDelivery) => {
    const normalizedMode = normalizeDeliveryMode(delivery?.mode)
    setFormDeliveryMode(normalizedMode)
    setFormDeliveryChannel(delivery?.channel?.trim() || 'feishu')
    setFormDeliveryTarget(delivery?.to?.trim() || '')
    setFormDeliveryAccountId(delivery?.accountId?.trim() || '')
    setFormDeliveryBestEffort(delivery?.bestEffort ?? true)
  }

  const selectJob = (job: CronJob) => {
    setSelectedJobId(job.id)
    setFormMode('edit')
    setPanelOpen(true)
    setConfirmDelete(false)
    setHistoryOpen(false)
    setFormName(job.name ?? '')
    applyScheduleToForm(job.schedule)
    setFormMessage(job.payload?.kind === 'agentTurn' ? (job.payload.message ?? '') : (job.payload?.text ?? ''))
    applyDeliveryToForm(job.delivery)
    setRuns([])
  }

  const openCreate = () => {
    setSelectedJobId(null)
    setFormMode('create')
    setPanelOpen(true)
    setConfirmDelete(false)
    setHistoryOpen(false)
    setFormName('')
    setFormScheduleMode('daily')
    setFormTime('09:00')
    setFormWeekday('1')
    setFormEveryValue('1')
    setFormDateTime(toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)))
    setFormAdvancedCron('0 9 * * *')
    setFormMessage('')
    applyDeliveryToForm()
    setRuns([])
  }

  const buildCronFromTime = (dayExpr: string) => {
    const [hourRaw = '09', minuteRaw = '00'] = formTime.split(':')
    return `${Number(minuteRaw)} ${Number(hourRaw)} * * ${dayExpr}`
  }

  const buildSchedule = (): CronSchedule => {
    switch (formScheduleMode) {
      case 'daily':
        return { kind: 'cron', expr: buildCronFromTime('*') }
      case 'weekdays':
        return { kind: 'cron', expr: buildCronFromTime('1-5') }
      case 'weekly':
        return { kind: 'cron', expr: buildCronFromTime(formWeekday) }
      case 'every-hours':
        return { kind: 'every', everyMs: Math.max(Number(formEveryValue) || 1, 1) * 3600000 }
      case 'every-days':
        return { kind: 'every', everyMs: Math.max(Number(formEveryValue) || 1, 1) * 86400000 }
      case 'once':
        return { kind: 'at', at: new Date(formDateTime).toISOString() }
      case 'advanced':
        return { kind: 'cron', expr: formAdvancedCron.trim() }
    }
  }

  const buildDelivery = (forUpdate: boolean): CronDelivery | undefined => {
    if (formDeliveryMode === 'none') {
      return forUpdate ? { mode: 'none' } : undefined
    }

    const delivery: CronDelivery = {
      mode: formDeliveryMode,
      bestEffort: formDeliveryBestEffort,
    }

    const channel = formDeliveryChannel.trim()
    const target = formDeliveryTarget.trim()
    const accountId = formDeliveryAccountId.trim()

    if (channel) delivery.channel = channel
    if (target) delivery.to = target
    if (accountId) delivery.accountId = accountId

    return delivery
  }

  const canSaveForm = () => {
    if (!formName.trim() || !formMessage.trim()) return false
    if (formDeliveryMode === 'announce' && (!formDeliveryChannel.trim() || !formDeliveryTarget.trim())) return false
    switch (formScheduleMode) {
      case 'daily':
      case 'weekdays':
        return Boolean(formTime)
      case 'weekly':
        return Boolean(formTime && formWeekday)
      case 'every-hours':
      case 'every-days':
        return Number(formEveryValue) > 0
      case 'once':
        return Boolean(formDateTime)
      case 'advanced':
        return Boolean(formAdvancedCron.trim())
    }
  }

  const runJob = async (id: string) => {
    if (!client) return
    try {
      await client.call('cron.run', { id })
      await loadRuns(id)
      await loadJobs()
    } catch {}
  }

  const toggleJob = async (job: CronJob) => {
    if (!client) return
    try {
      await client.call('cron.update', {
        id: job.id,
        patch: { enabled: !job.enabled },
      })
      setJobs(prev => prev.map(entry => (
        entry.id === job.id ? { ...entry, enabled: !entry.enabled } : entry
      )))
    } catch {}
  }

  const removeJob = async (id: string) => {
    if (!client) return
    try {
      await client.call('cron.remove', { id })
      closePanel()
      await loadJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const saveJob = async () => {
    if (!client || !formName.trim() || !formMessage.trim()) return
    setFormSaving(true)
    try {
      if (formMode === 'create') {
        await client.call('cron.add', {
          name: formName.trim(),
          schedule: buildSchedule(),
          payload: { kind: 'agentTurn', message: formMessage.trim() },
          delivery: buildDelivery(false),
          sessionTarget: 'isolated',
          wakeMode: 'now',
          enabled: true,
        })
      } else if (selectedJobId) {
        await client.call('cron.update', {
          id: selectedJobId,
          patch: {
            name: formName.trim(),
            schedule: buildSchedule(),
            payload: { kind: 'agentTurn', message: formMessage.trim() },
            delivery: buildDelivery(true),
          },
        })
      }

      setFormSaving(false)

      if (formMode === 'create') {
        closePanel()
      }

      await loadJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setFormSaving(false)
    }
  }

  const formatClockTime = (hour: string | number, minute: string | number) => (
    new Date(2000, 0, 1, Number(hour), Number(minute)).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  )

  const formatTime = (ts?: number) => {
    if (!ts) return '—'
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatSchedule = (schedule?: CronSchedule) => {
    if (!schedule) return ''

    switch (schedule.kind) {
      case 'cron': {
        const expr = schedule.expr?.trim() ?? ''
        const daily = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
        if (daily) return `Every day at ${formatClockTime(daily[2], daily[1])}`

        const weekdays = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(1-5|1,2,3,4,5)$/)
        if (weekdays) return `Weekdays at ${formatClockTime(weekdays[2], weekdays[1])}`

        const weekly = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-6])$/)
        if (weekly) {
          const day = WEEKDAY_OPTIONS.find(option => option.value === weekly[3])?.label ?? 'Day'
          return `${day} at ${formatClockTime(weekly[2], weekly[1])}`
        }

        return expr
      }
      case 'every': {
        const ms = schedule.everyMs ?? 0
        if (ms % 86400000 === 0) {
          const days = ms / 86400000
          return days === 1 ? 'Every day' : `Every ${days} days`
        }
        if (ms % 3600000 === 0) {
          const hours = ms / 3600000
          return hours === 1 ? 'Every hour' : `Every ${hours} hours`
        }
        if (ms >= 60000) return `Every ${ms / 60000} min`
        return `Every ${ms / 1000}s`
      }
      case 'at':
        return schedule.at ? `Once: ${new Date(schedule.at).toLocaleString()}` : ''
    }
  }

  const getSchedulePreview = () => formatSchedule(buildSchedule())

  const getJobPrompt = (job: CronJob) => (
    job.payload?.kind === 'agentTurn'
      ? (job.payload.message ?? '')
      : (job.payload?.text ?? '')
  )

  const getDeliverySummary = (delivery?: CronDelivery) => {
    const mode = normalizeDeliveryMode(delivery?.mode)
    if (mode === 'none') return 'Delivery off'
    if (mode === 'silent') return 'Silent run'
    const parts = ['Send reply']
    if (delivery?.channel) parts.push(delivery.channel)
    if (delivery?.to) parts.push(`→ ${delivery.to}`)
    return parts.join(' ')
  }

  const getStatusTone = (job: CronJob) => {
    if (!job.enabled) return 'bg-warn'
    return job.state?.lastRunStatus === 'error' ? 'bg-destructive' : 'bg-ok'
  }

  if (!client) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/10 p-2 text-accent">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text-strong">Automations</h2>
              <p className="text-sm text-muted-foreground">Create scheduled prompts and keep recurring work off your plate.</p>
            </div>
            <div className="ml-auto">
              <PrimaryActionButton
                onClick={openCreate}
              >
                New
              </PrimaryActionButton>
            </div>
          </div>
        </div>

        {error && (
          <div className="border-b border-destructive/20 bg-destructive/10 px-6 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md rounded-2xl border border-dashed border-border bg-bg-subtle px-8 py-10 text-center">
                <CalendarDays className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-text-strong">No automations yet</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create one for a morning summary, a weekly check-in, or any routine task you want Ocbot to handle automatically.
                </p>
                <Button
                  onClick={openCreate}
                  variant="secondary"
                  size="md"
                  className="mt-5"
                >
                  <Plus className="h-4 w-4" />
                  Create automation
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => {
                const selected = selectedJobId === job.id && panelOpen
                return (
                  <button
                    key={job.id}
                    onClick={() => selectJob(job)}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition-colors',
                      selected ? 'border-accent bg-accent-subtle/60' : 'border-border bg-card hover:bg-bg-hover',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', getStatusTone(job))} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="truncate text-sm font-semibold text-text-strong">
                            {job.name ?? job.id}
                          </span>
                          <span className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            job.enabled ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn',
                          )}>
                            {job.enabled ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{formatSchedule(job.schedule)}</div>
                        <div className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {getJobPrompt(job) || 'No prompt'}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {getDeliverySummary(job.delivery)}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5" />
                            Next run: {formatTime(job.state?.nextRunAtMs)}
                          </span>
                          <span>
                            Last run: {formatTime(job.state?.lastRunAtMs)}
                            {job.state?.lastRunStatus ? ` · ${job.state.lastRunStatus}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {panelOpen && (
        <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-text-strong">
                {formMode === 'edit' ? 'Edit automation' : 'New automation'}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formMode === 'edit' ? 'Update the schedule, prompt, and execution state.' : 'Set a schedule and tell Ocbot what to do.'}
              </div>
            </div>
            <Button
              onClick={closePanel}
              variant="ghost"
              size="icon"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <Field label="Name">
              <input
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Morning summary"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
              />
            </Field>

            <Field label="Schedule">
              <div className="flex flex-wrap gap-2">
                {SCHEDULE_PILLS.map(pill => {
                  const active = formScheduleMode === pill.value
                  return (
                    <Button
                      key={pill.value}
                      onClick={() => setFormScheduleMode(pill.value)}
                      variant={active ? 'segmentActive' : 'segment'}
                      size="xs"
                    >
                      {pill.label}
                    </Button>
                  )
                })}
              </div>
            </Field>

            {(formScheduleMode === 'daily' || formScheduleMode === 'weekdays') && (
              <Field label="Time">
                <input
                  type="time"
                  value={formTime}
                  onChange={(event) => setFormTime(event.target.value)}
                  className="w-40 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                />
              </Field>
            )}

            {formScheduleMode === 'weekly' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Day">
                  <select
                    value={formWeekday}
                    onChange={(event) => setFormWeekday(event.target.value)}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                  >
                    {WEEKDAY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Time">
                  <input
                    type="time"
                    value={formTime}
                    onChange={(event) => setFormTime(event.target.value)}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                  />
                </Field>
              </div>
            )}

            {(formScheduleMode === 'every-hours' || formScheduleMode === 'every-days') && (
              <Field label={`Every how many ${formScheduleMode === 'every-hours' ? 'hours' : 'days'}?`}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formEveryValue}
                  onChange={(event) => setFormEveryValue(event.target.value)}
                  className="w-32 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                />
              </Field>
            )}

            {formScheduleMode === 'once' && (
              <Field label="Date and time">
                <input
                  type="datetime-local"
                  value={formDateTime}
                  onChange={(event) => setFormDateTime(event.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
                />
              </Field>
            )}

            {formScheduleMode === 'advanced' && (
              <Field label="Cron expression">
                <input
                  value={formAdvancedCron}
                  onChange={(event) => setFormAdvancedCron(event.target.value)}
                  placeholder="0 9 * * *"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
                />
              </Field>
            )}

            <Field label="What should Ocbot do?">
              <textarea
                value={formMessage}
                onChange={(event) => setFormMessage(event.target.value)}
                placeholder="Summarize unread emails and list anything urgent."
                className="min-h-[96px] w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
              />
            </Field>

            <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  定时任务默认只运行不发送结果。若要推送到飞书，请填写 channel 和 target。
                </div>
              </div>

              <Field label="Mode">
                <div className="grid gap-2">
                  {DELIVERY_MODE_OPTIONS.map(option => {
                    const active = formDeliveryMode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormDeliveryMode(option.value)}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-left transition-colors',
                          active ? 'border-accent bg-accent-subtle/50' : 'border-border bg-bg hover:bg-bg-hover',
                        )}
                      >
                        <div className="text-sm font-medium text-text-strong">{option.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                      </button>
                    )
                  })}
                </div>
              </Field>

              {formDeliveryMode === 'announce' && (
                <>
                  <Field label="Channel">
                    <input
                      value={formDeliveryChannel}
                      onChange={(event) => setFormDeliveryChannel(event.target.value)}
                      placeholder="feishu"
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
                    />
                  </Field>

                  <Field label="Target">
                    <input
                      value={formDeliveryTarget}
                      onChange={(event) => setFormDeliveryTarget(event.target.value)}
                      placeholder={getDeliveryTargetPlaceholder(formDeliveryChannel.trim())}
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
                    />
                  </Field>

                  {formDeliveryChannel.trim() === 'feishu' && (
                    <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2 text-xs leading-5 text-muted-foreground">
                      Feishu 需要明确 target，格式可以是 user:openId、chat:chatId，或直接填写 chatId。
                    </div>
                  )}

                  <Field label="Account ID">
                    <input
                      value={formDeliveryAccountId}
                      onChange={(event) => setFormDeliveryAccountId(event.target.value)}
                      placeholder="default"
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-accent"
                    />
                  </Field>

                  <label className="flex items-start gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-3">
                    <input
                      type="checkbox"
                      checked={formDeliveryBestEffort}
                      onChange={(event) => setFormDeliveryBestEffort(event.target.checked)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-text-strong">Best effort</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        发送失败时仍将本次定时任务记为完成，避免因为渠道错误导致整次任务报错。
                      </div>
                    </div>
                  </label>
                </>
              )}
            </div>

            <div className="rounded-xl border border-border bg-bg-subtle px-3 py-2 text-sm text-muted-foreground">
              {getSchedulePreview()}
            </div>

            {formMode === 'edit' && currentJob && (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <div>Next run: {formatTime(currentJob.state?.nextRunAtMs)}</div>
                  <div>
                    Last run: {formatTime(currentJob.state?.lastRunAtMs)}
                    {currentJob.state?.lastRunStatus && (
                      <span className={cn(
                        'ml-2 font-medium',
                        currentJob.state.lastRunStatus === 'error' ? 'text-destructive' : 'text-ok',
                      )}>
                        {currentJob.state.lastRunStatus}
                      </span>
                    )}
                  </div>
                  {currentJob.state?.lastError && (
                    <div className="text-destructive">{currentJob.state.lastError}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border px-5 py-4">
            <div className="flex items-center gap-2">
              {formMode === 'edit' ? (
                <>
                  {confirmDelete ? (
                    <>
                      <span className="text-xs text-destructive">Delete?</span>
                      <Button
                        onClick={() => selectedJobId && removeJob(selectedJobId)}
                        variant="dangerSolid"
                        size="xs"
                      >
                        Yes
                      </Button>
                      <Button
                        onClick={() => setConfirmDelete(false)}
                        variant="secondary"
                        size="xs"
                      >
                        No
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => setConfirmDelete(true)}
                      variant="danger"
                      size="xs"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {currentJob && (
                      <>
                        <Button
                          onClick={() => selectedJobId && runJob(selectedJobId)}
                          variant="secondary"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Run
                        </Button>
                        <Button
                          onClick={() => toggleJob(currentJob)}
                          variant={currentJob.enabled ? 'tonal' : 'secondary'}
                        >
                          {currentJob.enabled ? 'Pause' : 'Resume'}
                        </Button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1" />
                  <Button
                    onClick={closePanel}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                </>
              )}

              <Button
                disabled={formSaving || !canSaveForm()}
                onClick={() => void saveJob()}
                variant="primary"
                size="md"
              >
                {formSaving ? 'Saving...' : formMode === 'edit' ? 'Save' : 'Create'}
              </Button>
            </div>

            {formMode === 'edit' && selectedJobId && (
              <div className="mt-3 border-t border-border pt-3">
                <Button
                  onClick={() => {
                    const nextOpen = !historyOpen
                    setHistoryOpen(nextOpen)
                    if (nextOpen && runs.length === 0) {
                      void loadRuns(selectedJobId)
                    }
                  }}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start border-none px-0"
                >
                  {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Run history
                  {runs.length > 0 ? <span className="text-xs text-muted-foreground/70">({runs.length})</span> : null}
                </Button>

                {historyOpen && (
                  <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                    {runsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading...
                      </div>
                    ) : runs.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No history yet</div>
                    ) : (
                      runs.map(run => (
                        <div key={`${run.jobId}-${run.ranAtMs}`} className="flex items-start gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2">
                          <span className="mt-0.5 shrink-0">
                            {run.status === 'ok' ? (
                              <CheckCircle2 className="h-4 w-4 text-ok" />
                            ) : run.status === 'error' ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>{formatTime(run.ranAtMs)}</span>
                              {run.durationMs ? <span>{(run.durationMs / 1000).toFixed(1)}s</span> : null}
                            </div>
                            <div className="mt-1 truncate text-sm text-text">
                              {run.error ?? run.summary ?? 'No details'}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  )
}
