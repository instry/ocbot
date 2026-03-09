// lib/skills/runner.ts
import type { AgentReplayStep, HealEvent, ReplayCallbacks } from '@/lib/agent/agentCache'
import type { LlmProvider, LlmRequestMessage } from '@/lib/llm/types'
import type { ActCache } from '@/lib/agent/cache'
import type { Variables } from '@/lib/agent/variables'
import type { AgentCallbacks } from '@/lib/agent/loop'
import type { Skill, SkillExecution, SkillRunCallbacks, SkillRunResult } from './types'
import { replayAgentSteps } from '@/lib/agent/agentCache'
import { runAgentLoop } from '@/lib/agent/loop'
import { SkillStore } from './store'
import { healStep, healSegment } from './heal'
import { getFragileStepIndices } from './fragility'
import { logDebug } from '@/lib/debug/eventLog'

const MAX_SKILL_DEPTH = 5

/**
 * Replace `%paramName%` placeholders in a string with parameter values.
 */
function substituteParams(text: string, params: Record<string, string>): string {
  return text.replace(/%([a-zA-Z_][a-zA-Z0-9_]*)%/g, (match, key) => {
    return key in params ? params[key] : match
  })
}

/**
 * Resolve a parameter map value: `%varName%` → lookup from variables/params, otherwise literal.
 */
function resolveParamValue(value: string, variables?: Variables): string {
  if (!variables) return value
  const match = value.match(/^%([a-zA-Z_][a-zA-Z0-9_]*)%$/)
  if (match) {
    const key = match[1]
    if (key in variables) return variables[key]
  }
  // Support inline %param% replacement for mixed strings like "prefix_%var%_suffix"
  if (value.includes('%')) {
    return substituteParams(value, variables)
  }
  return value
}

/**
 * Apply parameter substitution to all steps, returning new step objects.
 */
function substituteStepParams(
  steps: AgentReplayStep[],
  params: Record<string, string>,
): AgentReplayStep[] {
  return steps.map((step) => {
    switch (step.type) {
      case 'act':
        return { ...step, instruction: substituteParams(step.instruction, params) }
      case 'navigate':
        return { ...step, url: substituteParams(step.url, params) }
      case 'fillForm':
        return {
          ...step,
          fields: step.fields.map((f) => ({
            ...f,
            value: substituteParams(f.value, params),
          })),
        }
      case 'skill':
        return {
          ...step,
          parameterMap: Object.fromEntries(
            Object.entries(step.parameterMap).map(([k, v]) => [k, substituteParams(v, params)])
          ),
        }
      default:
        return step
    }
  })
}

/**
 * Produce a human-readable one-liner for a replay step (used in agent-track fallback context).
 */
function describeStep(step: AgentReplayStep): string {
  switch (step.type) {
    case 'navigate': return `Navigate to ${step.url}`
    case 'act': return `Act: "${step.instruction}"`
    case 'scroll': return `Scroll ${step.direction ?? 'down'}`
    case 'wait': return 'Wait for page load'
    case 'fillForm': return `Fill form (${step.fields.length} field${step.fields.length === 1 ? '' : 's'})`
    case 'skill': return `Run sub-skill ${step.skillId}`
    default: return step.type
  }
}

export class SkillRunner {
  private store: SkillStore

  constructor(store?: SkillStore) {
    this.store = store ?? new SkillStore()
  }

  /**
   * Execute fast-track only (no agent-track fallback).
   * Used by the auto-skill flow to prevent recursion when called from within the LLM loop.
   */
  async executeFastTrackOnly(
    skill: Skill,
    parameters: Record<string, string>,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    depth: number = 0,
    skillCallStack: string[] = [],
  ): Promise<SkillRunResult> {
    const result = await this.runFastTrack(skill, parameters, provider, cache, callbacks, signal, variables, depth, skillCallStack)
    await this.recordExecution(skill, parameters, result)
    return result
  }

  /**
   * Execute a skill using dual-track strategy:
   * 1. Fast Track — replay cached steps if available.
   * 2. Agent Track — full LLM loop as fallback.
   */
  async execute(
    skill: Skill,
    parameters: Record<string, string>,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    depth: number = 0,
    skillCallStack: string[] = [],
  ): Promise<SkillRunResult> {
    const startTime = Date.now()

    let result: SkillRunResult

    // --- Fast Track ---
    if (skill.steps.length > 0) {
      logDebug('execution', 'Track: fast')
      result = await this.runFastTrack(skill, parameters, provider, cache, callbacks, signal, variables, depth, skillCallStack)

      if (result.success) {
        await this.recordExecution(skill, parameters, result)
        return result
      }

      // Fast track failed — switch to agent track
      callbacks.onTrackSwitch('fast', 'agent')

      // Build progress context from executed steps so agent track can continue
      let completedContext: string | undefined
      if (result.executedSteps?.length) {
        const descs = result.executedSteps
          .map((s, i) => `${i + 1}. ${describeStep(s)}`)
          .join('\n')
        completedContext = `The following steps were already completed:\n${descs}`
      }

      const agentResult = await this.runAgentTrack(skill, parameters, provider, cache, callbacks, signal, variables, completedContext)
      // Mark as hybrid since we attempted fast first
      agentResult.track = 'hybrid'
      agentResult.durationMs = Date.now() - startTime

      // Evolve skill: merge fast-track completed steps + agent-track recorded steps
      if (agentResult.success && agentResult.updatedSteps?.length) {
        const executedSteps = result.executedSteps ?? []
        const mergedSteps = [...executedSteps, ...agentResult.updatedSteps]
        agentResult.updatedSteps = mergedSteps
        await this.evolveSkill(skill, mergedSteps)
        logDebug('evolution', 'Skill evolved from hybrid track', {
          fastSteps: executedSteps.length,
          agentSteps: agentResult.updatedSteps.length,
          totalSteps: mergedSteps.length,
        })
      }

      await this.recordExecution(skill, parameters, agentResult)
      return agentResult
    }

    // --- Agent Track (no steps available) ---
    logDebug('execution', 'Track: agent')
    result = await this.runAgentTrack(skill, parameters, provider, cache, callbacks, signal, variables)
    result.durationMs = Date.now() - startTime

    // Evolve skill: save agent-track recorded steps as the skill's first steps
    if (result.success && result.updatedSteps?.length) {
      await this.evolveSkill(skill, result.updatedSteps)
      logDebug('evolution', 'Skill evolved from agent track', { steps: result.updatedSteps.length })
    }

    await this.recordExecution(skill, parameters, result)
    return result
  }

  /**
   * Fast Track: Replay stored steps with parameter substitution.
   */
  private async runFastTrack(
    skill: Skill,
    parameters: Record<string, string>,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    depth: number = 0,
    skillCallStack: string[] = [],
  ): Promise<SkillRunResult> {
    const startTime = Date.now()
    const steps = substituteStepParams(skill.steps, parameters)

    // Dynamic import to avoid circular dependency
    const { executeTool } = await import('@/lib/agent/tools')

    const executeForReplay = (name: string, argsJson: string) => {
      if (name === 'skill') {
        return this.executeSubSkill(
          argsJson, provider, cache, callbacks, signal, variables, depth, skillCallStack,
        )
      }
      return executeTool(name, argsJson, provider, cache, signal, variables, { skillReplay: true })
    }

    const replayCallbacks: ReplayCallbacks = {
      onStepStart: (i, step) => callbacks.onStepStart(i, step),
      onStepEnd: (i, step, result) => callbacks.onStepEnd(i, step, result),
      onSkip: () => { /* no-op */ },
    }

    // L2 heal function: re-infer a single failed step via LLM
    const healFn = async (failedStep: AgentReplayStep, _stepIndex: number) => {
      return healStep(failedStep, provider)
    }

    const replayResult = await replayAgentSteps(steps, executeForReplay, replayCallbacks, signal, healFn)

    // Notify heal events
    for (const event of replayResult.healEvents) {
      callbacks.onHeal(event)
    }

    // L3: If replay failed (L2 already tried via healFn), attempt segment repair
    if (!replayResult.success) {
      logDebug('L3', 'Attempting segment repair', { failedIndex: replayResult.failedIndex })
      const l3Steps = await healSegment(steps, replayResult.failedIndex, skill.skillMd, provider)

      if (l3Steps && l3Steps.length > 0) {
        // Execute L3 re-planned steps via replay (with L2 heal enabled)
        const l3ReplayResult = await replayAgentSteps(l3Steps, executeForReplay, replayCallbacks, signal, healFn)

        for (const event of l3ReplayResult.healEvents) {
          callbacks.onHeal({ ...event, level: Math.max(event.level, 3) })
        }

        if (l3ReplayResult.success) {
          // Merge completed original steps + L3 steps for evolution
          const mergedSteps = [...steps.slice(0, replayResult.failedIndex), ...l3Steps]
          const result: SkillRunResult = {
            success: true,
            track: 'fast',
            healEvents: [
              ...replayResult.healEvents,
              {
                stepIndex: replayResult.failedIndex,
                level: 3,
                reason: 'l3_segment_repair',
                resolved: true,
                tokenCost: 2000,
                durationMs: Date.now() - startTime,
              },
              ...l3ReplayResult.healEvents,
            ],
            completedSteps: mergedSteps.length,
            totalSteps: mergedSteps.length,
            durationMs: Date.now() - startTime,
            updatedSteps: mergedSteps,
          }
          // Evolve with new steps (version bump)
          await this.evolveSkill(skill, mergedSteps)
          return result
        }

        // L3 also failed — return with accurate completed count including L3 progress
        return {
          success: false,
          track: 'fast' as const,
          healEvents: [...replayResult.healEvents, ...l3ReplayResult.healEvents],
          completedSteps: replayResult.failedIndex + (l3ReplayResult.failedIndex ?? 0),
          totalSteps: steps.length,
          durationMs: Date.now() - startTime,
          executedSteps: [
            ...steps.slice(0, replayResult.failedIndex),
            ...l3Steps.slice(0, l3ReplayResult.failedIndex ?? 0),
          ],
        }
      }

      // L3 not attempted (no l3Steps) — return original failure
      return {
        success: false,
        track: 'fast' as const,
        healEvents: replayResult.healEvents,
        completedSteps: replayResult.failedIndex,
        totalSteps: steps.length,
        durationMs: Date.now() - startTime,
        executedSteps: steps.slice(0, replayResult.failedIndex),
      }
    }

    const result: SkillRunResult = {
      success: true,
      track: 'fast',
      healEvents: replayResult.healEvents,
      completedSteps: steps.length,
      totalSteps: steps.length,
      durationMs: Date.now() - startTime,
    }

    // Evolution: if successful with heal events, update skill steps
    if (replayResult.healEvents.length > 0) {
      result.updatedSteps = steps
      await this.evolveSkill(skill, steps)
    }

    return result
  }

  /**
   * Agent Track: Build a prompt from skillMd + parameters, run full LLM loop.
   */
  private async runAgentTrack(
    skill: Skill,
    parameters: Record<string, string>,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    completedContext?: string,
  ): Promise<SkillRunResult> {
    const startTime = Date.now()

    // Build the user message from skillMd with parameter substitution
    let prompt = substituteParams(skill.skillMd, parameters)

    // Append parameter context if any
    const paramEntries = Object.entries(parameters)
    if (paramEntries.length > 0) {
      const paramBlock = paramEntries
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
      prompt += `\n\nParameters:\n${paramBlock}`
    }

    // If we have partial-progress context from fast track, replace prompt with a focused continuation
    if (completedContext) {
      prompt = `IMPORTANT: This task was partially completed by automated replay. The browser is already at an intermediate page. Do NOT restart from the beginning — continue from the current page state.\n\nTask: ${skill.name} — ${skill.description}\n\n${completedContext}\n\nContinue from where the replay left off. Look at the current page and perform the remaining action(s).`
      // Re-append parameters if any
      if (paramEntries.length > 0) {
        const paramBlock = paramEntries
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n')
        prompt += `\n\nParameters:\n${paramBlock}`
      }
    }

    const messages: LlmRequestMessage[] = [
      { role: 'user', content: prompt },
    ]

    // Capture steps recorded by the agent loop for skill evolution
    let recordedSteps: AgentReplayStep[] | undefined

    // Bridge SkillRunCallbacks to AgentCallbacks
    const agentCallbacks: AgentCallbacks = {
      onTextDelta: (text) => callbacks.onTextDelta(text),
      onToolCallStart: (id, name, args) => callbacks.onToolCallStart?.(id, name, args),
      onToolCallEnd: (id, name, result) => callbacks.onToolCallEnd?.(id, name, result),
      onAssistantMessage: (content, toolCalls) => callbacks.onAssistantMessage?.(content, toolCalls),
      onToolMessage: (toolCallId, name, result) => callbacks.onToolMessage?.(toolCallId, name, result),
      onError: () => { /* errors handled via result */ },
      onRecordedSteps: (steps) => { recordedSteps = steps },
    }

    let success = true
    try {
      await runAgentLoop(provider, messages, agentCallbacks, signal, cache, variables)
    } catch {
      success = false
    }

    return {
      success,
      track: 'agent',
      healEvents: [],
      completedSteps: 0,
      totalSteps: 0,
      durationMs: Date.now() - startTime,
      updatedSteps: recordedSteps,
    }
  }

  /**
   * Execute a sub-skill referenced by a 'skill' step.
   * Handles depth limiting, circular dependency detection, parameter mapping, and recursive execution.
   */
  private async executeSubSkill(
    argsJson: string,
    provider: LlmProvider,
    cache: ActCache,
    callbacks: SkillRunCallbacks,
    signal?: AbortSignal,
    variables?: Variables,
    depth: number = 0,
    skillCallStack: string[] = [],
  ): Promise<string> {
    const { skillId, parameterMap } = JSON.parse(argsJson) as {
      skillId: string
      parameterMap: Record<string, string>
    }
    const nextDepth = depth + 1

    // Depth check
    if (nextDepth > MAX_SKILL_DEPTH) {
      return JSON.stringify({ success: false, error: `Skill nesting too deep (max ${MAX_SKILL_DEPTH})` })
    }

    // Circular dependency check
    if (skillCallStack.includes(skillId)) {
      return JSON.stringify({
        success: false,
        error: `Circular skill dependency: ${[...skillCallStack, skillId].join(' → ')}`,
      })
    }

    // Load child skill
    const childSkill = await this.store.get(skillId)
    if (!childSkill) {
      return JSON.stringify({ success: false, error: `Skill not found: ${skillId}` })
    }

    // Map parameters from parent to child
    const childParams: Record<string, string> = {}
    for (const [childKey, parentRef] of Object.entries(parameterMap)) {
      childParams[childKey] = resolveParamValue(parentRef, variables)
    }

    // Recursive execute
    const runner = new SkillRunner(this.store)
    const result = await runner.execute(
      childSkill, childParams, provider, cache, callbacks,
      signal, variables, nextDepth, [...skillCallStack, skillId],
    )

    return JSON.stringify({
      success: result.success,
      track: result.track,
      durationMs: result.durationMs,
      completedSteps: result.completedSteps,
      totalSteps: result.totalSteps,
    })
  }

  /**
   * Evolve skill steps after a successful fast-track run that required healing.
   */
  private async evolveSkill(skill: Skill, updatedSteps: AgentReplayStep[]): Promise<void> {
    const updated: Skill = {
      ...skill,
      steps: updatedSteps,
      version: skill.version + 1,
      updatedAt: Date.now(),
    }
    await this.store.save(updated)
  }

  /**
   * Record execution and update skill metrics.
   */
  private async recordExecution(
    skill: Skill,
    parameters: Record<string, string>,
    result: SkillRunResult,
  ): Promise<void> {
    // Build execution record
    const primitiveCount = skill.steps.filter(s => 'primitive' in s && s.primitive).length
    const primitiveRatio = skill.steps.length > 0 ? primitiveCount / skill.steps.length : 0
    const execution: SkillExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      skillId: skill.id,
      skillVersion: skill.version,
      timestamp: Date.now(),
      track: result.track,
      healEvents: result.healEvents,
      totalSteps: result.totalSteps,
      completedSteps: result.completedSteps,
      success: result.success,
      url: skill.startUrl,
      parameters,
      durationMs: result.durationMs,
      primitiveRatio,
    }

    await this.store.addExecution(execution)

    // Update skill metrics
    const executions = await this.store.getExecutions(skill.id)
    const score = this.store.computeScore(executions)
    const totalRuns = skill.totalRuns + 1
    const successCount = skill.successCount + (result.success ? 1 : 0)

    // Determine status from score
    let status: 'active' | 'degraded' | 'archived' = 'active'
    if (score < 0.3) {
      status = 'archived'
    } else if (score < 0.6) {
      status = 'degraded'
    }

    // Compute fragile steps
    const fragileSteps = getFragileStepIndices(executions, skill.steps.length)
    if (fragileSteps.length > 0) {
      logDebug('fragility', 'Fragile steps', { indices: fragileSteps })
    }

    const updated: Skill = {
      ...skill,
      totalRuns,
      successCount,
      score,
      status,
      fragileSteps,
      updatedAt: Date.now(),
    }
    await this.store.save(updated)
  }
}
