import type { LlmProvider } from '../llm/types'
import { capturePageSnapshot } from './snapshot'
import { inferExtraction, type ExtractedData } from './inference'

export interface ExtractResult {
  success: boolean
  data: unknown
  error?: string
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

export async function extract(
  instruction: string,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<ExtractResult> {
  try {
    const tabId = await getActiveTabId()
    const snapshot = await capturePageSnapshot(tabId)
    if (signal?.aborted) throw new Error('Aborted')

    const result: ExtractedData = await inferExtraction(instruction, snapshot, provider, signal)
    return { success: true, data: result.data }
  } catch (err: unknown) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
