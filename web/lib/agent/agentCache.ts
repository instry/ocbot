import type { ActionStep } from './cache'
import type { FormField } from './fillForm'
import { logDebug } from '@/lib/debug/eventLog'

// --- Types ---

export type AgentReplayStep =
  | { type: 'act'; instruction: string; actions: ActionStep[]; primitive?: boolean }
  | { type: 'fillForm'; fields: FormField[]; actions: ActionStep[]; primitive?: boolean }
  | { type: 'navigate'; url: string; primitive?: boolean }
  | { type: 'scroll'; direction: string; primitive?: boolean }
  | { type: 'wait'; primitive?: boolean }
  | { type: 'ariaTree' | 'think' | 'extract' | 'observe' }
  | { type: 'skill'; skillId: string; parameterMap: Record<string, string>; primitive?: boolean }

// --- Replay engine ---

export interface HealEvent {
  stepIndex: number
  level: number
  reason: string
  resolved: boolean
  tokenCost: number
  durationMs: number
}

export interface ReplayResult {
  success: boolean
  failedIndex: number
  healEvents: HealEvent[]
}

export interface ReplayCallbacks {
  onStepStart: (index: number, step: AgentReplayStep) => void
  onStepEnd: (index: number, step: AgentReplayStep, result: string) => void
  onSkip: (index: number, step: AgentReplayStep) => void
}

const SKIP_TYPES = new Set(['ariaTree', 'think', 'extract', 'observe'])
const TAG = '[ocbot:replay]'

function stepSummary(step: AgentReplayStep): string {
  switch (step.type) {
    case 'act': return `act("${step.instruction.slice(0, 60)}")`
    case 'navigate': return `navigate(${step.url})`
    case 'fillForm': return `fillForm(${step.fields.map(f => f.field).join(', ')})`
    case 'scroll': return `scroll(${step.direction})`
    case 'wait': return 'wait'
    case 'skill': return `skill(${step.skillId})`
    default: return step.type
  }
}

export type HealFn = (failedStep: AgentReplayStep, stepIndex: number) => Promise<AgentReplayStep | null>

export async function replayAgentSteps(
  steps: AgentReplayStep[],
  executeToolFn: (name: string, argsJson: string) => Promise<string>,
  callbacks: ReplayCallbacks,
  signal?: AbortSignal,
  healFn?: HealFn,
): Promise<ReplayResult> {
  const healEvents: HealEvent[] = []
  console.group(`${TAG} Replaying ${steps.length} steps`)

  for (let i = 0; i < steps.length; i++) {
    if (signal?.aborted) return { success: false, failedIndex: i, healEvents }

    const step = steps[i]

    // Skip no-op steps
    if (SKIP_TYPES.has(step.type)) {
      console.log(`${TAG} [${i + 1}/${steps.length}] skip ${step.type}`)
      callbacks.onSkip(i, step)
      continue
    }

    callbacks.onStepStart(i, step)
    const stepStart = Date.now()
    console.log(`${TAG} [${i + 1}/${steps.length}] ▶ ${stepSummary(step)}`)

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
        case 'skill':
          result = await executeToolFn(
            'skill',
            JSON.stringify({ skillId: step.skillId, parameterMap: step.parameterMap }),
          )
          break
        default:
          continue
      }

      // Check if the result indicates failure
      const parsed = tryParseJson(result)
      if (parsed && parsed.success === false) {
        console.log(`${TAG} [${i + 1}/${steps.length}] ❌ failed (${Date.now() - stepStart}ms)`)
        // L2 heal: try healFn before giving up (skip for primitive steps — they are deterministic)
        if (healFn && !step.primitive) {
          logDebug('L2', 'Attempting L2 heal', { stepIndex: i, stepType: step.type })
          const healStart = Date.now()
          const healed = await healFn(step, i)
          if (healed) {
            logDebug('L2', 'L2 heal result', { resolved: true, stepIndex: i })
            console.log(`${TAG} [${i + 1}/${steps.length}] 🔧 L2 healed`)
            // L2 heal succeeded — record event and continue
            healEvents.push({
              stepIndex: i,
              level: 2,
              reason: 'l2_step_reinference',
              resolved: true,
              tokenCost: 500,
              durationMs: Date.now() - healStart,
            })
            // Update step in-place for evolution
            steps[i] = healed
            callbacks.onStepEnd(i, healed, JSON.stringify({ success: true, healed: true }))
            continue
          }
        }

        healEvents.push({
          stepIndex: i,
          level: 0,
          reason: (parsed.error as string) ?? 'step_returned_failure',
          resolved: false,
          tokenCost: 0,
          durationMs: Date.now() - stepStart,
        })
        callbacks.onStepEnd(i, step, result)
        console.groupEnd() // replay
        return { success: false, failedIndex: i, healEvents }
      }

      // Check if the act() self-healed (healed via xpath or fuzzy match)
      if (parsed && parsed.selfHealed === true) {
        console.log(`${TAG} [${i + 1}/${steps.length}] 🔧 self-healed (L${parsed.cacheHit ? 1 : 2})`)
        healEvents.push({
          stepIndex: i,
          level: parsed.cacheHit ? 1 : 2,
          reason: 'selector_changed',
          resolved: true,
          tokenCost: parsed.cacheHit ? 0 : (parsed.tokenCost as number ?? 0),
          durationMs: Date.now() - stepStart,
        })
      }

      const stepMs = Date.now() - stepStart
      const status = parsed?.status || ''
      console.log(`${TAG} [${i + 1}/${steps.length}] ✅ done (${stepMs}ms) ${status}`)
      callbacks.onStepEnd(i, step, result)
    } catch (err: unknown) {
      console.log(`${TAG} [${i + 1}/${steps.length}] ❌ exception: ${err instanceof Error ? err.message : String(err)}`)
      // L2 heal on exception too (skip for primitive steps — they are deterministic)
      if (healFn && !step.primitive) {
        const healStart = Date.now()
        const healed = await healFn(step, i)
        if (healed) {
          healEvents.push({
            stepIndex: i,
            level: 2,
            reason: 'l2_step_reinference',
            resolved: true,
            tokenCost: 500,
            durationMs: Date.now() - healStart,
          })
          steps[i] = healed
          callbacks.onStepEnd(i, healed, JSON.stringify({ success: true, healed: true }))
          continue
        }
      }

      healEvents.push({
        stepIndex: i,
        level: 0,
        reason: err instanceof Error ? err.message : 'unknown_error',
        resolved: false,
        tokenCost: 0,
        durationMs: Date.now() - stepStart,
      })
      console.groupEnd() // replay
      return { success: false, failedIndex: i, healEvents }
    }
  }

  console.groupEnd() // replay
  return { success: true, failedIndex: -1, healEvents }
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
      const actions = (parsed?.actions as ActionStep[]) ?? []
      // For direct acts (nodeId+method), args.instruction is empty — use description from result
      let instruction = (args.instruction as string) || ''
      if (!instruction && parsed?.description) {
        instruction = parsed.description as string
      }
      return { type: 'act', instruction, actions }
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
    case 'skill':
      return {
        type: 'skill',
        skillId: (args.skillId as string) || '',
        parameterMap: (args.parameterMap as Record<string, string>) || {},
      }
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
