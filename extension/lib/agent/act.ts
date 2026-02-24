import type { LlmProvider } from '../llm/types'
import type { ActCache, ActionStep } from './cache'
import { buildRoleName, fuzzyMatchByRoleName } from './cache'
import { capturePageSnapshot, type PageSnapshot } from './snapshot'
import { inferActions } from './inference'
import { ensureAttached, sendCdp } from './cdp'

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

async function resolveNode(
  tabId: number,
  backendNodeId: number,
): Promise<string> {
  const { object } = await sendCdp<{ object: { objectId: string } }>(
    tabId,
    'DOM.resolveNode',
    { backendNodeId },
  )
  return object.objectId
}

async function scrollIntoView(tabId: number, objectId: string): Promise<void> {
  try {
    await sendCdp(tabId, 'DOM.scrollIntoViewIfNeeded', { objectId })
  } catch {
    // Best effort — some nodes may not support scrolling
  }
}

async function getClickPoint(
  tabId: number,
  backendNodeId: number,
): Promise<{ x: number; y: number }> {
  const { model } = await sendCdp<{
    model: { content: number[] }
  }>(tabId, 'DOM.getBoxModel', { backendNodeId })

  // content quad: [x1,y1, x2,y2, x3,y3, x4,y4]
  const q = model.content
  const x = (q[0] + q[2] + q[4] + q[6]) / 4
  const y = (q[1] + q[3] + q[5] + q[7]) / 4
  return { x, y }
}

async function cdpClick(tabId: number, backendNodeId: number): Promise<void> {
  const objectId = await resolveNode(tabId, backendNodeId)
  await scrollIntoView(tabId, objectId)
  const { x, y } = await getClickPoint(tabId, backendNodeId)

  await sendCdp(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved', x, y,
  })
  await sendCdp(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', clickCount: 1,
  })
  await sendCdp(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
  })

  await sendCdp(tabId, 'Runtime.releaseObject', { objectId })
}

async function cdpType(
  tabId: number,
  backendNodeId: number,
  text: string,
): Promise<void> {
  const objectId = await resolveNode(tabId, backendNodeId)
  await scrollIntoView(tabId, objectId)

  // Focus the element
  await sendCdp(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.focus(); }',
  })

  // Clear existing value
  await sendCdp(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.value = ""; }',
  })

  // Insert text via CDP
  await sendCdp(tabId, 'Input.insertText', { text })

  // Dispatch input/change events
  await sendCdp(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
  })

  await sendCdp(tabId, 'Runtime.releaseObject', { objectId })
}

async function cdpSelect(
  tabId: number,
  backendNodeId: number,
  value: string,
): Promise<void> {
  const objectId = await resolveNode(tabId, backendNodeId)
  await scrollIntoView(tabId, objectId)

  await sendCdp(tabId, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function(val) {
      this.value = val;
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    arguments: [{ value }],
  })

  await sendCdp(tabId, 'Runtime.releaseObject', { objectId })
}

async function cdpPress(tabId: number, key: string): Promise<void> {
  await sendCdp(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key,
  })
  await sendCdp(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key,
  })
}

async function executeAction(
  tabId: number,
  action: ActionStep,
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.method) {
      case 'click':
        await cdpClick(tabId, action.backendNodeId)
        return { success: true }
      case 'type':
        await cdpType(tabId, action.backendNodeId, action.args?.[0] || '')
        return { success: true }
      case 'select':
        await cdpSelect(tabId, action.backendNodeId, action.args?.[0] || '')
        return { success: true }
      case 'press':
        await cdpPress(tabId, action.args?.[0] || 'Enter')
        return { success: true }
      default:
        return { success: false, error: `Unknown method: ${action.method}` }
    }
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

/**
 * Try to self-heal cached actions by fuzzy-matching roleName in current AXTree.
 * Returns updated actions with new backendNodeIds, or null if matching fails.
 */
function selfHealFromSnapshot(
  cachedActions: ActionStep[],
  snapshot: PageSnapshot,
): ActionStep[] | null {
  const healed: ActionStep[] = []
  for (const action of cachedActions) {
    const match = fuzzyMatchByRoleName(action.roleName, snapshot.elements)
    if (!match) return null
    healed.push({
      ...action,
      backendNodeId: match.backendNodeId,
    })
  }
  return healed
}

export async function act(
  instruction: string,
  provider: LlmProvider,
  cache: ActCache,
  signal?: AbortSignal,
): Promise<ActResult> {
  const tabId = await getActiveTabId()
  const url = await getActiveTabUrl()
  await ensureAttached(tabId)

  // 1. Check cache
  const cached = await cache.lookup(instruction, url)
  if (cached) {
    // Try self-heal via roleName match first (no LLM needed)
    const snapshot = await capturePageSnapshot(tabId)
    const healed = selfHealFromSnapshot(cached.actions, snapshot)

    if (healed) {
      const replay = await replayActions(tabId, healed)
      if (replay.success) {
        await cache.update(instruction, url, healed)
        return {
          success: true,
          actions: healed,
          description: cached.description,
          cacheHit: true,
          selfHealed: healed !== cached.actions,
        }
      }
    }

    // Self-heal failed — fall through to full LLM re-inference
    console.log('[ocbot] Cache self-heal failed, re-inferring...')
    if (signal?.aborted) throw new Error('Aborted')

    const freshSnapshot = healed ? await capturePageSnapshot(tabId) : snapshot
    const inferred = await inferActions(instruction, freshSnapshot, provider, signal)
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
