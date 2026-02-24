import type { LlmProvider } from '../llm/types'
import type { ActCache, ActionStep } from './cache'
import { capturePageSnapshot } from './snapshot'
import { inferActions } from './inference'

export interface ActResult {
  success: boolean
  actions: ActionStep[]
  description: string
  cacheHit: boolean
  selfHealed: boolean
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

async function getActiveTabUrl(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url || ''
}

async function executeAction(tabId: number, action: ActionStep): Promise<{ success: boolean; error?: string }> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (selector: string, method: string, args: string[]) => {
        const el = document.querySelector(selector) as HTMLElement | null
        if (!el) return { success: false, error: `Element not found: ${selector}` }

        switch (method) {
          case 'click':
            el.click()
            return { success: true }
          case 'type': {
            const input = el as HTMLInputElement | HTMLTextAreaElement
            input.focus()
            input.value = args[0] || ''
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            return { success: true }
          }
          case 'select': {
            const select = el as HTMLSelectElement
            select.value = args[0] || ''
            select.dispatchEvent(new Event('change', { bubbles: true }))
            return { success: true }
          }
          case 'press': {
            const key = args[0] || 'Enter'
            el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
            el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
            if (key === 'Enter') {
              const form = el.closest('form')
              if (form) form.requestSubmit()
            }
            return { success: true }
          }
          default:
            return { success: false, error: `Unknown method: ${method}` }
        }
      },
      args: [action.selector, action.method, action.args || []],
    })
    return results[0]?.result as { success: boolean; error?: string } || { success: false, error: 'No result' }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function replayActions(
  tabId: number,
  actions: ActionStep[],
): Promise<{ success: boolean; failedIndex: number }> {
  for (let i = 0; i < actions.length; i++) {
    const result = await executeAction(tabId, actions[i])
    if (!result.success) {
      return { success: false, failedIndex: i }
    }
  }
  return { success: true, failedIndex: -1 }
}

export async function act(
  instruction: string,
  provider: LlmProvider,
  cache: ActCache,
  signal?: AbortSignal,
): Promise<ActResult> {
  const tabId = await getActiveTabId()
  const url = await getActiveTabUrl()

  // 1. Check cache
  const cached = await cache.lookup(instruction, url)
  if (cached) {
    // Try replay
    const replay = await replayActions(tabId, cached.actions)
    if (replay.success) {
      return {
        success: true,
        actions: cached.actions,
        description: cached.description,
        cacheHit: true,
        selfHealed: false,
      }
    }

    // Self-heal: re-infer and update cache
    console.log('[ocbot] Cache replay failed, self-healing...')
    const snapshot = await capturePageSnapshot(tabId)
    if (signal?.aborted) throw new Error('Aborted')

    const inferred = await inferActions(instruction, snapshot, provider, signal)
    const healReplay = await replayActions(tabId, inferred.actions)

    if (healReplay.success) {
      await cache.update(instruction, url, inferred.actions)
    }

    return {
      success: healReplay.success,
      actions: inferred.actions,
      description: inferred.description,
      cacheHit: false,
      selfHealed: true,
    }
  }

  // 2. Cache miss: snapshot → infer → execute → store
  const snapshot = await capturePageSnapshot(tabId)
  if (signal?.aborted) throw new Error('Aborted')

  const inferred = await inferActions(instruction, snapshot, provider, signal)
  const result = await replayActions(tabId, inferred.actions)

  if (result.success) {
    await cache.store(instruction, url, inferred.actions, inferred.description)
  }

  return {
    success: result.success,
    actions: inferred.actions,
    description: inferred.description,
    cacheHit: false,
    selfHealed: false,
  }
}
