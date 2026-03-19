export type CronType = 'cron' | 'interval' | 'once'
export type TaskStatus = 'active' | 'paused' | 'completed'

export interface CronTask {
  id: string
  name: string
  prompt: string
  cronType: CronType
  cronValue: string // cron expr | ms interval | ISO timestamp
  nextRun: number | null // epoch ms
  lastRun: number | null
  lastResult: string | null // truncated summary (200 chars)
  status: TaskStatus
  createdAt: number
  updatedAt: number
}

export interface TaskExecutionLog {
  id: string
  taskId: string
  runAt: number
  durationMs: number
  status: 'success' | 'error'
  result: string | null
  error?: string
}
