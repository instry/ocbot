import { CronExpressionParser } from 'cron-parser'
import { getCronTasks, saveCronTask, addTaskLog } from './storage'
import { executeCronTask } from './executor'
import type { CronTask } from './types'

const ALARM_NAME = 'ocbot_cron_tick'
let running = false

export function computeNextRun(task: CronTask): number | null {
  const now = Date.now()

  if (task.cronType === 'once') return null

  if (task.cronType === 'cron') {
    try {
      const interval = CronExpressionParser.parse(task.cronValue)
      return interval.next().getTime()
    } catch {
      return null
    }
  }

  if (task.cronType === 'interval') {
    const ms = parseInt(task.cronValue, 10)
    if (!ms || ms <= 0) return now + 60_000
    // Anchor to scheduled time to prevent drift
    let next = (task.nextRun ?? now) + ms
    while (next <= now) next += ms
    return next
  }

  return null
}

async function onCronTick(): Promise<void> {
  if (running) return
  running = true

  try {
    const tasks = await getCronTasks()
    const now = Date.now()
    const dueTasks = tasks.filter(t => t.status === 'active' && t.nextRun !== null && t.nextRun <= now)

    for (const task of dueTasks) {
      const log = await executeCronTask(task)
      await addTaskLog(log)

      // Update task after run
      const nextRun = computeNextRun(task)
      await saveCronTask({
        ...task,
        lastRun: now,
        lastResult: log.status === 'error' ? `Error: ${log.error}` : (log.result ?? 'Completed'),
        nextRun,
        status: task.cronType === 'once' ? 'completed' : task.status,
        updatedAt: Date.now(),
      })
    }
  } catch (err) {
    console.error('[ocbot] Cron tick error:', err)
  } finally {
    running = false
  }
}

export function initCron(): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) onCronTick()
  })
  console.log('[ocbot] Cron initialized')
}
