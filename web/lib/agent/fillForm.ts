import type { LlmProvider } from '../llm/types'
import type { ActCache, ActionStep } from './cache'
import type { Variables } from './variables'
import { act, type ActResult } from './act'
import { substituteVariables } from './variables'

export interface FormField {
  field: string   // e.g. "email address"
  value: string   // e.g. "%email%" or "hello@test.com"
}

export interface FillFormFieldResult {
  field: string
  success: boolean
  error?: string
  actions: ActionStep[]
}

export interface FillFormResult {
  success: boolean
  fields: FillFormFieldResult[]
  allActions: ActionStep[]
}

export async function fillForm(
  fields: FormField[],
  provider: LlmProvider,
  cache: ActCache,
  signal?: AbortSignal,
  variables?: Variables,
): Promise<FillFormResult> {
  const fieldResults: FillFormFieldResult[] = []
  const allActions: ActionStep[] = []
  let allSuccess = true

  for (const { field, value } of fields) {
    if (signal?.aborted) {
      allSuccess = false
      break
    }

    const resolvedValue = variables ? substituteVariables(value, variables) : value
    const instruction = `type ${resolvedValue} in the ${field}`

    let result: ActResult
    try {
      result = await act(instruction, provider, cache, signal)
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      fieldResults.push({ field, success: false, error, actions: [] })
      allSuccess = false
      continue
    }

    fieldResults.push({
      field,
      success: result.success,
      error: result.success ? undefined : `Failed to fill field "${field}"`,
      actions: result.actions,
    })
    allActions.push(...result.actions)

    if (!result.success) {
      allSuccess = false
    }
  }

  return { success: allSuccess, fields: fieldResults, allActions }
}
