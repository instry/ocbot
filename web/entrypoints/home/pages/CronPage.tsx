import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, Trash2, Clock, Plus, ChevronDown, ChevronRight, RotateCw } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'
import type { CronTask, TaskExecutionLog, CronType } from '@/lib/cron/types'
import { computeNextRun } from '@/lib/cron/engine'

type View = 'list' | 'form'

const CRON_PRESETS = [
  { label: 'cron.preset.everyHour', value: '0 * * * *' },
  { label: 'cron.preset.daily9am', value: '0 9 * * *' },
  { label: 'cron.preset.weekdays9am', value: '0 9 * * 1-5' },
  { label: 'cron.preset.everyMonday', value: '0 9 * * 1' },
]

const INTERVAL_PRESETS = [
  { label: 'cron.preset.1min', value: '60000' },
  { label: 'cron.preset.5min', value: '300000' },
  { label: 'cron.preset.30min', value: '1800000' },
  { label: 'cron.preset.1hour', value: '3600000' },
]

async function sendMsg(type: string, data?: Record<string, unknown>) {
  return chrome.runtime.sendMessage({ type, ...data })
}

function formatNextRun(ts: number | null, t: (k: string) => string): string {
  if (!ts) return t('cron.noNextRun')
  return new Date(ts).toLocaleString()
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-500/15 text-green-600',
    paused: 'bg-yellow-500/15 text-yellow-600',
    completed: 'bg-gray-500/15 text-gray-500',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? ''}`}>
      {t(`cron.status.${status}`)}
    </span>
  )
}
function TaskForm({ task, onSave, onCancel, t }: {
  task?: CronTask
  onSave: (task: CronTask) => void
  onCancel: () => void
  t: (k: string) => string
}) {
  const [name, setName] = useState(task?.name ?? '')
  const [prompt, setPrompt] = useState(task?.prompt ?? '')
  const [cronType, setCronType] = useState<CronType>(task?.cronType ?? 'interval')
  const [cronValue, setCronValue] = useState(task?.cronValue ?? '3600000')

  const handleSubmit = () => {
    const now = Date.now()
    const newTask: CronTask = {
      id: task?.id ?? crypto.randomUUID(),
      name: name.trim() || 'Untitled Task',
      prompt,
      cronType,
      cronValue,
      nextRun: null,
      lastRun: task?.lastRun ?? null,
      lastResult: task?.lastResult ?? null,
      status: task?.status ?? 'active',
      createdAt: task?.createdAt ?? now,
      updatedAt: now,
    }
    newTask.nextRun = computeNextRun(newTask)
    onSave(newTask)
  }

  const presets = cronType === 'cron' ? CRON_PRESETS : cronType === 'interval' ? INTERVAL_PRESETS : []

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h2 className="text-lg font-semibold">{task ? t('cron.editTask') : t('cron.createTask')}</h2>
      <div>
        <label className="mb-1 block text-sm font-medium">{t('cron.taskName')}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('cron.taskNamePlaceholder')}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">{t('cron.prompt')}</label>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder={t('cron.promptPlaceholder')}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">{t('cron.cronType')}</label>
        <div className="flex gap-2">
          {(['interval', 'cron', 'once'] as CronType[]).map(ct => (
            <button key={ct} onClick={() => setCronType(ct)}
              className={`rounded-lg px-3 py-1.5 text-sm ${cronType === ct ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
              {t(`cron.type.${ct}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">{t('cron.cronValue')}</label>
        {presets.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {presets.map(p => (
              <button key={p.value} onClick={() => setCronValue(p.value)}
                className={`rounded px-2 py-1 text-xs ${cronValue === p.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {t(p.label)}
              </button>
            ))}
          </div>
        )}
        <input value={cronValue} onChange={e => setCronValue(e.target.value)}
          placeholder={cronType === 'cron' ? '0 9 * * *' : cronType === 'interval' ? '3600000' : new Date().toISOString()}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
        <p className="mt-1 text-xs text-muted-foreground">{t(`cron.valueHint.${cronType}`)}</p>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={handleSubmit} disabled={!prompt.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {t('common.save')}
        </button>
        <button onClick={onCancel}
          className="rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground hover:bg-muted/80">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

function LogsPanel({ taskId, t }: { taskId: string; t: (k: string) => string }) {
  const [logs, setLogs] = useState<TaskExecutionLog[]>([])
  useEffect(() => {
    sendMsg('getTaskLogs', { taskId }).then(r => { if (r?.ok) setLogs(r.logs.reverse()) })
  }, [taskId])

  if (logs.length === 0) return <p className="px-4 py-2 text-xs text-muted-foreground">{t('cron.noLogs')}</p>

  return (
    <div className="space-y-1 px-4 pb-2">
      {logs.slice(0, 10).map(log => (
        <div key={log.id} className="flex items-center gap-2 text-xs">
          <span className={log.status === 'success' ? 'text-green-600' : 'text-red-500'}>{log.status}</span>
          <span className="text-muted-foreground">{new Date(log.runAt).toLocaleString()}</span>
          <span className="text-muted-foreground">{log.durationMs}ms</span>
          {log.result && <span className="truncate text-foreground">{log.result}</span>}
          {log.error && <span className="truncate text-red-500">{log.error}</span>}
        </div>
      ))}
    </div>
  )
}
export function CronPage() {
  const { t } = useI18n()
  const [tasks, setTasks] = useState<CronTask[]>([])
  const [view, setView] = useState<View>('list')
  const [editingTask, setEditingTask] = useState<CronTask | undefined>()
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null)

  const refresh = useCallback(() => {
    sendMsg('getCronTasks').then(r => { if (r?.ok) setTasks(r.tasks) })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ocbot_cron_tasks) refresh()
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [refresh])

  const handleSave = async (task: CronTask) => {
    await sendMsg('saveCronTask', { task })
    setView('list')
    setEditingTask(undefined)
    refresh()
  }

  const handleDelete = async (id: string) => {
    await sendMsg('deleteCronTask', { taskId: id })
    refresh()
  }

  const handleToggle = async (task: CronTask) => {
    const type = task.status === 'active' ? 'pauseCronTask' : 'resumeCronTask'
    await sendMsg(type, { taskId: task.id })
    refresh()
  }

  const handleRunNow = async (id: string) => {
    await sendMsg('runTaskNow', { taskId: id })
    refresh()
  }

  if (view === 'form') {
    return <TaskForm task={editingTask} onSave={handleSave} onCancel={() => { setView('list'); setEditingTask(undefined) }} t={t} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">{t('cron.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('cron.description')}</p>
        </div>
        <button onClick={() => { setEditingTask(undefined); setView('form') }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> {t('cron.createTask')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Clock className="h-12 w-12 opacity-20" />
            <p className="text-sm">{t('cron.noTasks')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {tasks.map(task => (
              <div key={task.id} className="px-6 py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{task.name}</span>
                      <StatusBadge status={task.status} t={t} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">{task.prompt}</p>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      <span>{t(`cron.type.${task.cronType}`)}: {task.cronValue}</span>
                      <span>{t('cron.nextRun')}: {formatNextRun(task.nextRun, t)}</span>
                      {task.lastResult && <span className="truncate max-w-[200px]">{task.lastResult}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button onClick={() => handleRunNow(task.id)} title={t('cron.runNow')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                    {task.status !== 'completed' && (
                      <button onClick={() => handleToggle(task)} title={task.status === 'active' ? t('cron.pause') : t('cron.resume')}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        {task.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button onClick={() => { setEditingTask(task); setView('form') }} title={t('common.edit')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Clock className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(task.id)} title={t('common.delete')}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setExpandedLogs(expandedLogs === task.id ? null : task.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                      {expandedLogs === task.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                {expandedLogs === task.id && <LogsPanel taskId={task.id} t={t} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}