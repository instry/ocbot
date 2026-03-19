import type { CronTask, TaskExecutionLog } from './types'
import type { AgentCallbacks } from '../agent/loop'
import { runAgentLoop } from '../agent/loop'
import { ActCache } from '../agent/cache'
import { getProviders, getDefaultProviderId } from '../storage'

const TASK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export async function executeCronTask(task: CronTask): Promise<TaskExecutionLog> {
  const startTime = Date.now()

  // Get default provider
  const providers = await getProviders()
  const defaultId = await getDefaultProviderId()
  const provider = providers.find(p => p.id === defaultId) ?? providers[0]

  if (!provider) {
    return {
      id: crypto.randomUUID(),
      taskId: task.id,
      runAt: startTime,
      durationMs: Date.now() - startTime,
      status: 'error',
      result: null,
      error: 'No LLM provider configured',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TASK_TIMEOUT_MS)

  let responseText = ''
  const actCache = new ActCache()

  const callbacks: AgentCallbacks = {
    onTextDelta: (text) => { responseText += text },
    onToolCallStart: () => {},
    onToolCallEnd: () => {},
    onAssistantMessage: () => {},
    onToolMessage: () => {},
    onError: (error) => { responseText = `Error: ${error}` },
  }

  try {
    const messages = [{ role: 'user' as const, content: task.prompt }]
    await runAgentLoop(provider, messages, callbacks, controller.signal, actCache)

    clearTimeout(timeout)
    const result = responseText.trim() || 'Completed'
    return {
      id: crypto.randomUUID(),
      taskId: task.id,
      runAt: startTime,
      durationMs: Date.now() - startTime,
      status: 'success',
      result: result.slice(0, 200),
    }
  } catch (err: unknown) {
    clearTimeout(timeout)
    const error = err instanceof Error ? err.message : String(err)
    return {
      id: crypto.randomUUID(),
      taskId: task.id,
      runAt: startTime,
      durationMs: Date.now() - startTime,
      status: 'error',
      result: null,
      error,
    }
  }
}
