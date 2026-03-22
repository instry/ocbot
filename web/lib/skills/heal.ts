// lib/skills/heal.ts — L2 (step re-inference) and L3 (segment repair) self-healing
import type { AgentReplayStep } from '@/lib/agent/agentCache'
import type { ActionStep } from '@/lib/agent/cache'
import type { LlmRequestMessage } from '@/lib/llm/types'
import type { PageSnapshot } from '@/lib/agent/snapshot'
import { capturePageSnapshot } from '@/lib/agent/snapshot'
import { buildRoleName } from '@/lib/agent/cache'
import { streamChat } from '@/lib/gateway/client'
import { logDebug } from '@/lib/debug/eventLog'

// --- Helpers ---

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

async function callLlm(
  gatewayUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const messages: LlmRequestMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  let result = ''
  for await (const event of streamChat(gatewayUrl, model, messages)) {
    if (event.type === 'text_delta') {
      result += event.text
    } else if (event.type === 'error') {
      throw new Error(event.error)
    }
  }
  return result
}

function parseJsonResponse<T>(raw: string): T {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return JSON.parse(cleaned)
}

function formatSnapshotForPrompt(snapshot: PageSnapshot): string {
  let text = `URL: ${snapshot.url}\nTitle: ${snapshot.title}\n\n## Interactive Elements\n`
  text += snapshot.tree
  return text
}

// --- L2: Step Re-Inference ---

const HEAL_STEP_SYSTEM = `You are a browser automation repair assistant. A single step in an automation failed because the element selector changed. Given the current page snapshot and the failed step's instruction, re-infer the actions needed to complete JUST this one step.

The snapshot shows elements in this format:
[nodeId] role: "name" value="..." (focused)

Rules:
- Use the nodeId (number in brackets) to reference elements
- Each action has a method: "click", "type", "select", or "press"
- For "type": args[0] is the text to type
- For "select": args[0] is the option value
- For "press": args[0] is the key name (e.g. "Enter", "Escape")
- For "click": no args needed
- Return actions in execution order
- Be precise — pick the most specific matching element

Respond with ONLY valid JSON, no markdown fences:
{"actions":[{"method":"click"|"type"|"select"|"press","nodeId":42,"args":["..."],"description":"..."}]}`

/**
 * L2 Self-Heal: Re-infer actions for a single failed step via LLM.
 * ~500 tokens. Only handles act/fillForm steps.
 *
 * Returns an updated step with new actions, or null on failure.
 */
export async function healStep(
  failedStep: AgentReplayStep,
  gatewayUrl: string,
  model: string,
): Promise<AgentReplayStep | null> {
  // Only heal act/fillForm steps
  if (failedStep.type !== 'act' && failedStep.type !== 'fillForm') return null

  try {
    const instruction = failedStep.type === 'act'
      ? failedStep.instruction
      : `Fill form fields: ${failedStep.fields.map(f => `${f.field}: ${f.value}`).join(', ')}`

    logDebug('L2', 'Re-inferring step', { instruction })

    const tabId = await getActiveTabId()
    const snapshot = await capturePageSnapshot(tabId)

    const snapshotText = formatSnapshotForPrompt(snapshot)
    const userPrompt = `## Page Snapshot\n${snapshotText}\n\n## Failed Step Instruction\n${instruction}`

    const raw = await callLlm(gatewayUrl, model, HEAL_STEP_SYSTEM, userPrompt)
    const parsed = parseJsonResponse<{
      actions: Array<{ method: string; nodeId: number; args?: string[]; description: string }>
    }>(raw)

    if (!parsed.actions || parsed.actions.length === 0) return null

    const actions: ActionStep[] = parsed.actions.map((a) => {
      const el = snapshot.elements.find((e) => e.backendNodeId === a.nodeId)
      if (!el) throw new Error(`Node ID ${a.nodeId} not found in snapshot`)
      return {
        method: a.method as ActionStep['method'],
        xpath: snapshot.xpathMap[el.encodedId] || '',
        encodedId: el.encodedId,
        backendNodeId: el.backendNodeId,
        roleName: buildRoleName(el.role, el.name),
        args: a.args,
        description: a.description,
      }
    })

    // Execute the healed actions
    const { executeTool } = await import('@/lib/agent/tools')

    if (failedStep.type === 'act') {
      const result = await executeTool('act', JSON.stringify({ instruction }), gatewayUrl, model, undefined as never, undefined, undefined)
      const resultParsed = JSON.parse(result)
      if (resultParsed.success === false) {
        logDebug('L2', 'healStep done', { success: false })
        return null
      }
      logDebug('L2', 'healStep done', { success: true })
      return { ...failedStep, actions: resultParsed.actions ?? actions }
    }

    // For fillForm, re-execute with original fields
    const result = await executeTool('fillForm', JSON.stringify({ fields: failedStep.fields }), gatewayUrl, model, undefined as never, undefined, undefined)
    const resultParsed = JSON.parse(result)
    if (resultParsed.success === false) {
      logDebug('L2', 'healStep done', { success: false })
      return null
    }
    logDebug('L2', 'healStep done', { success: true })
    return { ...failedStep, actions: resultParsed.actions ?? actions }
  } catch {
    logDebug('L2', 'healStep done', { success: false, error: true })
    return null
  }
}

// --- L3: Segment Repair ---

const HEAL_SEGMENT_SYSTEM = `You are a browser automation planner. An automation skill partially completed but got stuck because the page flow changed. Given the skill description, completed steps summary, and current page state, plan the REMAINING steps to complete the task.

The snapshot shows elements in this format:
[nodeId] role: "name" value="..." (focused)

Return steps as a JSON array. Each step must be one of:
- {"type":"act","instruction":"what to do"}
- {"type":"navigate","url":"https://..."}
- {"type":"scroll","direction":"down"|"up"}
- {"type":"wait"}

Rules:
- Only plan steps that still need to happen
- Be specific in instructions — reference visible element text
- Keep steps atomic (one action per step)
- Use navigate only when URL needs to change

Respond with ONLY valid JSON, no markdown fences:
{"steps":[...]}`

/**
 * L3 Self-Heal: Re-plan remaining steps when the page flow has changed.
 * ~2000 tokens. Uses SKILL.md as context for the full task intent.
 *
 * Returns new steps array or null on failure.
 */
export async function healSegment(
  allSteps: AgentReplayStep[],
  failedIndex: number,
  skillMd: string,
  gatewayUrl: string,
  model: string,
): Promise<AgentReplayStep[] | null> {
  try {
    logDebug('L3', 'Re-planning segment', { failedIndex })

    const tabId = await getActiveTabId()
    const snapshot = await capturePageSnapshot(tabId)

    // Summarize completed steps
    const completedSummary = allSteps.slice(0, failedIndex).map((step, i) => {
      switch (step.type) {
        case 'act': return `${i + 1}. [act] ${step.instruction}`
        case 'navigate': return `${i + 1}. [navigate] ${step.url}`
        case 'fillForm': return `${i + 1}. [fillForm] ${step.fields.map(f => f.field).join(', ')}`
        case 'scroll': return `${i + 1}. [scroll] ${step.direction}`
        case 'wait': return `${i + 1}. [wait]`
        default: return `${i + 1}. [${step.type}]`
      }
    }).join('\n')

    const snapshotText = formatSnapshotForPrompt(snapshot)
    const userPrompt = `## Skill Description\n${skillMd}\n\n## Completed Steps (1–${failedIndex})\n${completedSummary}\n\n## Current Page Snapshot\n${snapshotText}\n\n## Task\nPlan the remaining steps to complete this skill. Steps 1–${failedIndex} already executed. Step ${failedIndex + 1} failed. What steps are needed from the current page state to finish?`

    const raw = await callLlm(gatewayUrl, model, HEAL_SEGMENT_SYSTEM, userPrompt)
    const parsed = parseJsonResponse<{
      steps: Array<{ type: string; instruction?: string; url?: string; direction?: string }>
    }>(raw)

    if (!parsed.steps || parsed.steps.length === 0) return null

    // Convert to AgentReplayStep[]
    const newSteps: AgentReplayStep[] = parsed.steps.map((s) => {
      switch (s.type) {
        case 'act':
          return { type: 'act' as const, instruction: s.instruction || '', actions: [] }
        case 'navigate':
          return { type: 'navigate' as const, url: s.url || '' }
        case 'scroll':
          return { type: 'scroll' as const, direction: s.direction || 'down' }
        case 'wait':
          return { type: 'wait' as const }
        default:
          return { type: 'act' as const, instruction: s.instruction || '', actions: [] }
      }
    })

    logDebug('L3', 'healSegment done', { stepCount: newSteps.length })
    return newSteps
  } catch {
    logDebug('L3', 'healSegment done', { stepCount: 0, error: true })
    return null
  }
}
