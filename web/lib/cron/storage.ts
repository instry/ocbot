import { storage } from '../storage-backend'
import type { CronTask, TaskExecutionLog } from './types'

const STORAGE_KEYS = {
  tasks: 'ocbot_cron_tasks',
  logs: 'ocbot_task_logs',
} as const

const MAX_LOGS = 200

// --- Cron Tasks CRUD ---

export async function getCronTasks(): Promise<CronTask[]> {
  const result = await storage.get(STORAGE_KEYS.tasks)
  return (result[STORAGE_KEYS.tasks] as CronTask[]) || []
}

export async function saveCronTask(task: CronTask): Promise<void> {
  const all = await getCronTasks()
  const idx = all.findIndex(t => t.id === task.id)
  if (idx >= 0) {
    all[idx] = { ...task, updatedAt: Date.now() }
  } else {
    all.push(task)
  }
  await storage.set({ [STORAGE_KEYS.tasks]: all })
}

export async function deleteCronTask(id: string): Promise<void> {
  const all = await getCronTasks()
  const filtered = all.filter(t => t.id !== id)
  await storage.set({ [STORAGE_KEYS.tasks]: filtered })
}

// --- Task Execution Logs ---

export async function getTaskLogs(taskId?: string): Promise<TaskExecutionLog[]> {
  const result = await storage.get(STORAGE_KEYS.logs)
  const logs = (result[STORAGE_KEYS.logs] as TaskExecutionLog[]) || []
  if (taskId) return logs.filter(l => l.taskId === taskId)
  return logs
}

export async function addTaskLog(log: TaskExecutionLog): Promise<void> {
  const all = await getTaskLogs()
  all.push(log)
  // FIFO cap
  const trimmed = all.length > MAX_LOGS ? all.slice(-MAX_LOGS) : all
  await storage.set({ [STORAGE_KEYS.logs]: trimmed })
}
