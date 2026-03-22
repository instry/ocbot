import type { LlmRequestMessage, ContentPart } from '../llm/types'
import type { PageSnapshot } from './snapshot'
import type { ActionStep } from './cache'
import { buildRoleName } from './cache'
import { streamChat } from '../gateway/client'

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
  nodeId: number
  roleName: string
  method: string
}

// --- Prompt building ---

function formatSnapshotForPrompt(snapshot: PageSnapshot): string {
  let text = `URL: ${snapshot.url}\nTitle: ${snapshot.title}\n\n## Interactive Elements\n`
  text += snapshot.tree
  return text
}

const ACT_SYSTEM = `You are a browser automation assistant. Given a page snapshot (accessibility tree) and a user instruction, identify the element(s) to interact with and the action(s) to perform.

The snapshot shows elements in this format:
[encodedId] role: "name" value="..." (focused)

Where encodedId is a string like "0-123" that uniquely identifies each element.

## Available methods
- "click": Click an element. No arguments needed.
- "type": Type text into an input. arguments[0] = text to type.
- "fill": Set the value of an input. arguments[0] = value to set.
- "press": Press a keyboard key. arguments[0] = key name (e.g. "Enter", "Escape", "Tab").
- "select": Select an option from a <select> element. arguments[0] = option value.
- "hover": Hover over an element. No arguments needed.

## Dropdown handling
CASE 1 — Native <select> element:
  Use method "select" with the option value. Single action, no twoStep needed.

CASE 2 — Custom dropdown (div/button based):
  Set "twoStep": true. The first action should click to open the dropdown.
  A second inference call will follow to select the option from the expanded menu.

## Rules
- Use the encodedId (string in brackets like "0-123") to reference elements
- Return actions in execution order
- Be precise — pick the most specific matching element
- Set "twoStep": true ONLY for custom dropdowns that need two interactions (click to open, then select)

Respond with ONLY valid JSON, no markdown fences:
{"actions":[{"elementId":"0-123","method":"click","arguments":[],"description":"...","twoStep":false}],"description":"overall description"}`

const STEP_TWO_SYSTEM = `You are a browser automation assistant performing the SECOND step of a two-step interaction (e.g. selecting from a dropdown that was just opened).

The first step was: {firstStepDescription}

The snapshot below shows the page AFTER the first step. Find the correct element to complete the action.

The snapshot shows elements in this format:
[encodedId] role: "name" value="..." (focused)

Rules:
- Look for the newly appeared option/item that matches what the user wants
- Use the encodedId to reference the element
- Return a single action

Respond with ONLY valid JSON, no markdown fences:
{"actions":[{"elementId":"0-123","method":"click","arguments":[],"description":"..."}],"description":"selected the target option"}`

const EXTRACT_SYSTEM = `You are a data extraction assistant. Given a page snapshot (accessibility tree) and an instruction, extract the requested information from the page content.

Rules:
- Extract exactly what was asked for
- Return structured data when appropriate (arrays, objects)
- Use the element names and values to find the information

Respond with ONLY valid JSON, no markdown fences:
{"data": <extracted data>}`

const OBSERVE_SYSTEM = `You are a browser page analyzer. Given a page snapshot (accessibility tree) and an instruction, identify the available actions the user could take on the page.

The snapshot shows elements in this format:
[encodedId] role: "name" value="..." (focused)

Rules:
- List actions relevant to the instruction
- Include the encodedId and a human-readable description
- Focus on interactive elements

Respond with ONLY valid JSON, no markdown fences:
{"actions":[{"description":"...","nodeId":"0-42","method":"click"|"type"|"select"|"press"}]}`

// --- LLM call helpers ---

async function callLlm(
  gatewayUrl: string,
  model: string,
  systemPrompt: string,
  userContent: string | ContentPart[],
  signal?: AbortSignal,
): Promise<string> {
  const messages: LlmRequestMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]

  let result = ''
  for await (const event of streamChat(gatewayUrl, model, messages, undefined, signal)) {
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

/** Parse encodedId "0-123" to extract backendNodeId */
function parseEncodedId(encodedId: string): number {
  const parts = encodedId.split('-')
  if (parts.length === 2) {
    return parseInt(parts[1], 10)
  }
  // Fallback: try direct parse
  return parseInt(encodedId, 10)
}

// --- Public inference functions ---

export async function inferActions(
  instruction: string,
  snapshot: PageSnapshot,
  gatewayUrl: string,
  model: string,
  signal?: AbortSignal,
): Promise<InferredActions> {
  const snapshotText = formatSnapshotForPrompt(snapshot)
  const userContent = `## Page Snapshot\n${snapshotText}\n\n## Instruction\n${instruction}`

  const raw = await callLlm(gatewayUrl, model, ACT_SYSTEM, userContent, signal)
  console.log(`[ocbot:act] LLM raw response (${raw.length} chars):`, raw.slice(0, 300))
  const parsed = parseJsonResponse<{
    actions: Array<{
      elementId: string
      method: string
      arguments?: string[]
      description: string
      twoStep?: boolean
    }>
    description: string
  }>(raw)

  const actions: ActionStep[] = parsed.actions.map((a) => {
    const backendNodeId = parseEncodedId(a.elementId)
    const el = snapshot.elements.find((e) => e.backendNodeId === backendNodeId)
    if (!el) throw new Error(`Element ${a.elementId} not found in snapshot`)
    const xpath = snapshot.xpathMap[a.elementId] || ''
    return {
      method: a.method as ActionStep['method'],
      xpath,
      encodedId: a.elementId,
      backendNodeId,
      roleName: buildRoleName(el.role, el.name),
      args: a.arguments,
      description: a.description,
      twoStep: a.twoStep || undefined,
    }
  })

  return { actions, description: parsed.description }
}

/**
 * Infer the second step of a two-step interaction.
 * Called after the first step (e.g. opening a dropdown) with a fresh snapshot.
 */
export async function inferStepTwo(
  snapshot: PageSnapshot,
  firstStepDescription: string,
  gatewayUrl: string,
  model: string,
  signal?: AbortSignal,
): Promise<InferredActions> {
  const snapshotText = formatSnapshotForPrompt(snapshot)
  const systemPrompt = STEP_TWO_SYSTEM.replace('{firstStepDescription}', firstStepDescription)
  const userContent = `## Page Snapshot (after first step)\n${snapshotText}`

  const raw = await callLlm(gatewayUrl, model, systemPrompt, userContent, signal)
  console.log(`[ocbot:act] StepTwo LLM response (${raw.length} chars):`, raw.slice(0, 300))
  const parsed = parseJsonResponse<{
    actions: Array<{
      elementId: string
      method: string
      arguments?: string[]
      description: string
    }>
    description: string
  }>(raw)

  const actions: ActionStep[] = parsed.actions.map((a) => {
    const backendNodeId = parseEncodedId(a.elementId)
    const el = snapshot.elements.find((e) => e.backendNodeId === backendNodeId)
    if (!el) throw new Error(`Element ${a.elementId} not found in snapshot`)
    const xpath = snapshot.xpathMap[a.elementId] || ''
    return {
      method: a.method as ActionStep['method'],
      xpath,
      encodedId: a.elementId,
      backendNodeId,
      roleName: buildRoleName(el.role, el.name),
      args: a.arguments,
      description: a.description,
    }
  })

  return { actions, description: parsed.description }
}

export async function inferExtraction(
  instruction: string,
  snapshot: PageSnapshot,
  gatewayUrl: string,
  model: string,
  signal?: AbortSignal,
): Promise<ExtractedData> {
  const snapshotText = formatSnapshotForPrompt(snapshot)
  const userPrompt = `## Page Snapshot\n${snapshotText}\n\n## Instruction\n${instruction}`

  const raw = await callLlm(gatewayUrl, model, EXTRACT_SYSTEM, userPrompt, signal)
  return parseJsonResponse<ExtractedData>(raw)
}

export async function inferObservation(
  instruction: string,
  snapshot: PageSnapshot,
  gatewayUrl: string,
  model: string,
  signal?: AbortSignal,
): Promise<ObservedAction[]> {
  const snapshotText = formatSnapshotForPrompt(snapshot)
  const userPrompt = `## Page Snapshot\n${snapshotText}\n\n## Instruction\n${instruction}`

  const raw = await callLlm(gatewayUrl, model, OBSERVE_SYSTEM, userPrompt, signal)
  const parsed = parseJsonResponse<{ actions: Array<{ description: string; nodeId: string | number; method: string }> }>(raw)

  // Enrich with roleName from snapshot
  return parsed.actions.map((a) => {
    const nid = typeof a.nodeId === 'string' ? parseEncodedId(a.nodeId) : a.nodeId
    const el = snapshot.elements.find((e) => e.backendNodeId === nid)
    return {
      description: a.description,
      nodeId: nid,
      method: a.method,
      roleName: el ? buildRoleName(el.role, el.name) : '',
    }
  })
}
