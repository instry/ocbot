import type { LlmProvider, LlmRequestMessage } from '../llm/types'
import type { PageSnapshot } from './snapshot'
import type { ActionStep } from './cache'
import { streamChat } from '../llm/client'

// --- Types ---

export interface InferredActions {
  actions: ActionStep[]
  description: string
}

export interface ExtractedData {
  data: unknown
}

export interface ObservedAction {
  description: string
  elementIndex: number
  selector: string
  method: string
}

// --- Prompt building ---

function formatSnapshotForPrompt(snapshot: PageSnapshot): string {
  let text = `URL: ${snapshot.url}\nTitle: ${snapshot.title}\n\n## Interactive Elements\n`
  for (const el of snapshot.elements) {
    const attrStr = Object.entries(el.attributes)
      .filter(([k]) => k !== 'class') // class is noisy
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')
    const extra = attrStr ? ` ${attrStr}` : ''
    text += `[${el.index}] <${el.tag}${extra}> "${el.text}" selector="${el.selector}"\n`
  }
  return text
}

const ACT_SYSTEM = `You are a browser automation assistant. Given a page snapshot and a user instruction, identify the element(s) to interact with and the action(s) to perform.

Rules:
- Use the elementIndex from the snapshot to reference elements
- Each action has a method: "click", "type", "select", or "press"
- For "type": args[0] is the text to type
- For "select": args[0] is the option value
- For "press": args[0] is the key name (e.g. "Enter", "Escape")
- For "click": no args needed
- Return actions in execution order
- Be precise — pick the most specific matching element

Respond with ONLY valid JSON, no markdown fences:
{"actions":[{"method":"click"|"type"|"select"|"press","elementIndex":0,"args":["..."],"description":"..."}],"description":"overall description"}`

const EXTRACT_SYSTEM = `You are a data extraction assistant. Given a page snapshot and an instruction, extract the requested information from the page content.

Rules:
- Extract exactly what was asked for
- Return structured data when appropriate (arrays, objects)
- Use the page text and element content to find the information

Respond with ONLY valid JSON, no markdown fences:
{"data": <extracted data>}`

const OBSERVE_SYSTEM = `You are a browser page analyzer. Given a page snapshot and an instruction, identify the available actions the user could take on the page.

Rules:
- List actions relevant to the instruction
- Include the element index, selector, and a human-readable description
- Focus on interactive elements

Respond with ONLY valid JSON, no markdown fences:
{"actions":[{"description":"...","elementIndex":0,"selector":"...","method":"click"|"type"|"select"|"press"}]}`

// --- LLM call helpers ---

async function callLlm(
  provider: LlmProvider,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const messages: LlmRequestMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  let result = ''
  for await (const event of streamChat(provider, messages, undefined, signal)) {
    if (event.type === 'text_delta') {
      result += event.text
    } else if (event.type === 'error') {
      throw new Error(event.error)
    }
  }
  return result
}

function parseJsonResponse<T>(raw: string): T {
  // Strip markdown fences if present
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return JSON.parse(cleaned)
}

// --- Public inference functions ---

export async function inferActions(
  instruction: string,
  snapshot: PageSnapshot,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<InferredActions> {
  const snapshotText = formatSnapshotForPrompt(snapshot)
  const userPrompt = `## Page Snapshot\n${snapshotText}\n\n## Instruction\n${instruction}`

  const raw = await callLlm(provider, ACT_SYSTEM, userPrompt, signal)
  const parsed = parseJsonResponse<{
    actions: Array<{ method: string; elementIndex: number; args?: string[]; description: string }>
    description: string
  }>(raw)

  // Map elementIndex to actual selectors from snapshot
  const actions: ActionStep[] = parsed.actions.map((a) => {
    const el = snapshot.elements[a.elementIndex]
    if (!el) throw new Error(`Element index ${a.elementIndex} not found in snapshot`)
    return {
      method: a.method as ActionStep['method'],
      selector: el.selector,
      args: a.args,
      description: a.description,
    }
  })

  return { actions, description: parsed.description }
}

export async function inferExtraction(
  instruction: string,
  snapshot: PageSnapshot,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<ExtractedData> {
  const snapshotText = formatSnapshotForPrompt(snapshot)
  const userPrompt = `## Page Snapshot\n${snapshotText}\n\n## Page Text (truncated)\n${snapshot.text}\n\n## Instruction\n${instruction}`

  const raw = await callLlm(provider, EXTRACT_SYSTEM, userPrompt, signal)
  return parseJsonResponse<ExtractedData>(raw)
}

export async function inferObservation(
  instruction: string,
  snapshot: PageSnapshot,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<ObservedAction[]> {
  const snapshotText = formatSnapshotForPrompt(snapshot)
  const userPrompt = `## Page Snapshot\n${snapshotText}\n\n## Instruction\n${instruction}`

  const raw = await callLlm(provider, OBSERVE_SYSTEM, userPrompt, signal)
  const parsed = parseJsonResponse<{ actions: ObservedAction[] }>(raw)

  // Enrich selectors from snapshot
  return parsed.actions.map((a) => {
    const el = snapshot.elements[a.elementIndex]
    return {
      ...a,
      selector: el?.selector || a.selector,
    }
  })
}
