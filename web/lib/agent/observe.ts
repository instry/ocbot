import { capturePageSnapshot } from './snapshot'
import { inferObservation, type ObservedAction } from './inference'

export interface ObserveResult {
  success: boolean
  actions: ObservedAction[]
  error?: string
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

export async function observe(
  instruction: string,
  gatewayUrl: string,
  model: string,
  signal?: AbortSignal,
): Promise<ObserveResult> {
  try {
    const tabId = await getActiveTabId()
    const snapshot = await capturePageSnapshot(tabId)
    if (signal?.aborted) throw new Error('Aborted')

    const actions = await inferObservation(instruction, snapshot, gatewayUrl, model, signal)
    return { success: true, actions }
  } catch (err: unknown) {
    return {
      success: false,
      actions: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
