// lib/skills/paramExtractor.ts
import type { SkillParameter } from './types'
import type { LlmProvider, LlmRequestMessage } from '@/lib/llm/types'
import { streamChat } from '@/lib/llm/client'

/**
 * Strip markdown code fences from a string so we can parse raw JSON.
 */
function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}

/**
 * Use LLM to extract parameter values from a user instruction.
 *
 * If `parameters` is empty, returns `{}` immediately (no LLM call).
 */
export async function extractSkillParams(
  instruction: string,
  parameters: SkillParameter[],
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  if (parameters.length === 0) return {}

  const paramDescriptions = parameters.map(p => {
    let desc = `- ${p.name} (${p.type}, ${p.required ? 'required' : 'optional'}): ${p.description}`
    if (p.options?.length) desc += ` [options: ${p.options.join(', ')}]`
    if (p.default != null) desc += ` [default: ${p.default}]`
    return desc
  }).join('\n')

  const prompt = [
    'Extract parameter values from the user instruction.',
    '',
    'Parameters:',
    paramDescriptions,
    '',
    `User instruction: "${instruction}"`,
    '',
    'Return ONLY a JSON object with extracted values. Omit parameters you cannot confidently extract.',
    'Example: {"keyword": "mac 硬盘"}',
  ].join('\n')

  const messages: LlmRequestMessage[] = [
    { role: 'user', content: prompt },
  ]

  let responseText = ''
  for await (const event of streamChat(provider, messages, undefined, signal)) {
    if (event.type === 'text_delta') {
      responseText += event.text
    } else if (event.type === 'error') {
      console.warn('[paramExtractor] LLM error:', event.error)
      return {}
    }
  }

  try {
    const cleaned = stripCodeFences(responseText)
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    // Only keep string values for known parameter names
    const result: Record<string, string> = {}
    for (const p of parameters) {
      if (p.name in parsed && parsed[p.name] != null && parsed[p.name] !== '') {
        result[p.name] = String(parsed[p.name])
      }
    }
    return result
  } catch {
    console.warn('[paramExtractor] Failed to parse LLM response:', responseText)
    return {}
  }
}

/**
 * Return required parameters that are missing from extracted values and have no default.
 */
export function getMissingParams(
  parameters: SkillParameter[],
  extracted: Record<string, string>,
): SkillParameter[] {
  return parameters.filter(p =>
    p.required && !(p.name in extracted) && p.default == null
  )
}
