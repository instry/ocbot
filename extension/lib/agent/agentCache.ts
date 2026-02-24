import type { ActionStep } from './cache'
import type { FormField } from './fillForm'

// --- Types ---

export type AgentReplayStep =
  | { type: 'act'; instruction: string; actions: ActionStep[] }
  | { type: 'fillForm'; fields: FormField[]; actions: ActionStep[] }
  | { type: 'navigate'; url: string }
  | { type: 'scroll'; direction: string }
  | { type: 'wait' }
  | { type: 'ariaTree' | 'think' | 'extract' | 'observe' }

export interface AgentCacheEntry {
  version: 1
  instruction: string
  startUrl: string
  variableKeys: string[]
  configSignature: string
  steps: AgentReplayStep[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'ocbot_agent_cache'
const MAX_ENTRIES = 100

async function computeHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function buildCacheKey(instruction: string, startUrl: string, variableKeys: string[], configSignature: string): string {
  return JSON.stringify({ instruction: instruction.trim().toLowerCase(), startUrl, variableKeys, configSignature })
}

// --- AgentCache class ---

export class AgentCache {
  private async getAll(): Promise<Record<string, AgentCacheEntry>> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return (result[STORAGE_KEY] as Record<string, AgentCacheEntry>) || {}
  }

  private async setAll(data: Record<string, AgentCacheEntry>): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: data })
  }

  async lookup(
    instruction: string,
    startUrl: string,
    variableKeys: string[],
    configSignature: string,
  ): Promise<AgentCacheEntry | null> {
    const key = await computeHash(buildCacheKey(instruction, startUrl, variableKeys, configSignature))
    const all = await this.getAll()
    const entry = all[key]
    if (!entry) return null
    entry.updatedAt = Date.now()
    all[key] = entry
    await this.setAll(all)
    return entry
  }

  async store(
    instruction: string,
    startUrl: string,
    variableKeys: string[],
    configSignature: string,
    steps: AgentReplayStep[],
  ): Promise<void> {
    const key = await computeHash(buildCacheKey(instruction, startUrl, variableKeys, configSignature))
    const all = await this.getAll()

    // LRU eviction
    const keys = Object.keys(all)
    if (keys.length >= MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0))
      const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES + 1)
      for (const k of toRemove) delete all[k]
    }

    all[key] = {
      version: 1,
      instruction: instruction.trim().toLowerCase(),
      startUrl,
      variableKeys,
      configSignature,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await this.setAll(all)
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEY)
  }
}

// --- Replay engine ---

export interface ReplayCallbacks {
  onStepStart: (index: number, step: AgentReplayStep) => void
  onStepEnd: (index: number, step: AgentReplayStep, result: string) => void
  onSkip: (index: number, step: AgentReplayStep) => void
}

const SKIP_TYPES = new Set(['ariaTree', 'think', 'extract', 'observe'])

export async function replayAgentSteps(
  steps: AgentReplayStep[],
  executeToolFn: (name: string, argsJson: string) => Promise<string>,
  callbacks: ReplayCallbacks,
  signal?: AbortSignal,
): Promise<{ success: boolean; failedIndex: number }> {
  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) return { success: false, failedIndex: i }

    const step = steps[i]

    // Skip no-op steps
    if (SKIP_TYPES.has(step.type)) {
      callbacks.onSkip(i, step)
      continue
    }

    callbacks.onStepStart(i, step)

    try {
      let result: string
      switch (step.type) {
        case 'act':
          result = await executeToolFn('act', JSON.stringify({ instruction: step.instruction }))
          break
        case 'fillForm':
          result = await executeToolFn('fillForm', JSON.stringify({ fields: step.fields }))
          break
        case 'navigate':
          result = await executeToolFn('navigate', JSON.stringify({ url: step.url }))
          break
        case 'scroll':
          result = await executeToolFn('scroll', JSON.stringify({ direction: step.direction }))
          break
        case 'wait':
          result = await executeToolFn('waitForNavigation', '{}')
          break
        default:
          continue
      }

      // Check if the result indicates failure
      const parsed = tryParseJson(result)
      if (parsed && parsed.success === false) {
        callbacks.onStepEnd(i, step, result)
        return { success: false, failedIndex: i }
      }

      callbacks.onStepEnd(i, step, result)
    } catch {
      return { success: false, failedIndex: i }
    }
  }

  return { success: true, failedIndex: -1 }
}

// --- Mapping helpers ---

export function toolCallToReplayStep(
  name: string,
  args: Record<string, unknown>,
  result: string,
): AgentReplayStep | null {
  switch (name) {
    case 'act': {
      const parsed = tryParseJson(result)
      const actions = parsed?.actions ? [] as ActionStep[] : []
      return { type: 'act', instruction: (args.instruction as string) || '', actions }
    }
    case 'fillForm': {
      const fields = (args.fields || []) as FormField[]
      return { type: 'fillForm', fields, actions: [] }
    }
    case 'navigate':
      return { type: 'navigate', url: (args.url as string) || '' }
    case 'scroll':
      return { type: 'scroll', direction: (args.direction as string) || 'down' }
    case 'waitForNavigation':
      return { type: 'wait' }
    case 'ariaTree':
      return { type: 'ariaTree' }
    case 'think':
      return { type: 'think' }
    case 'extract':
      return { type: 'extract' }
    case 'observe':
      return { type: 'observe' }
    default:
      return null
  }
}

export function getConfigSignature(provider: { type: string; modelId: string }): string {
  return `${provider.type}:${provider.modelId}`
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
