import type { ActCache, ActionStep } from './cache'
import { buildRoleName } from './cache'
import { capturePageSnapshot, type PageSnapshot } from './snapshot'
import { inferActions, inferStepTwo } from './inference'
import { ensureAttached, sendCdp } from './cdp'
import { diffTrees } from './diff'
import { logDebug } from '@/lib/debug/eventLog'

export interface ActOptions {
  /** When true, verify click actions had an effect via diffTrees */
  skillReplay?: boolean
}

export interface ActResult {
  success: boolean
  actions: ActionStep[]
  description: string
  cacheHit: boolean
  selfHealed: boolean
  /** Set when a click action had no observable effect (only during skillReplay) */
  noEffect?: boolean
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

// --- XPath resolution ---

/**
 * Resolve an XPath expression to a backendNodeId via Runtime.evaluate + DOM.describeNode.
 * Returns null if the XPath doesn't match any element.
 */
async function findByXPath(tabId: number, xpath: string): Promise<number | null> {
  try {
    const { result } = await sendCdp<{
      result: { objectId?: string; type: string; subtype?: string }
    }>(tabId, 'Runtime.evaluate', {
      expression: `document.evaluate(${JSON.stringify(xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`,
      returnByValue: false,
    })

    if (!result.objectId || result.subtype === 'null') return null

    const { node } = await sendCdp<{
      node: { backendNodeId: number }
    }>(tabId, 'DOM.describeNode', { objectId: result.objectId })

    await sendCdp(tabId, 'Runtime.releaseObject', { objectId: result.objectId })
    return node.backendNodeId
  } catch {
    return null
  }
}

/**
 * Execute an action on an element found by XPath.
 * First resolves XPath → backendNodeId, then delegates to the standard CDP methods.
 */
async function executeByXPath(
  tabId: number,
  xpath: string,
  method: string,
  args?: string[],
): Promise<{ success: boolean; backendNodeId?: number; error?: string }> {
  const backendNodeId = await findByXPath(tabId, xpath)
  if (backendNodeId == null) {
    return { success: false, error: `XPath not found: ${xpath}` }
  }

  const result = await executeAction(tabId, {
    method: method as ActionStep['method'],
    xpath,
    encodedId: '',
    backendNodeId,
    roleName: '',
    args,
    description: '',
  })

  return { ...result, backendNodeId }
}

// --- Action execution ---

async function executeAction(
  tabId: number,
  action: ActionStep,
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.method) {
      case 'click':
        console.log(`[ocbot:act] click #${action.backendNodeId} ${action.roleName}`)
        await cdpClick(tabId, action.backendNodeId)
        return { success: true }
      case 'type':
      case 'fill':
        console.log(`[ocbot:act] ${action.method} #${action.backendNodeId} "${action.args?.[0]}"`)
        await cdpType(tabId, action.backendNodeId, action.args?.[0] || '')
        return { success: true }
      case 'select':
        console.log(`[ocbot:act] select #${action.backendNodeId} "${action.args?.[0]}"`)
        await cdpSelect(tabId, action.backendNodeId, action.args?.[0] || '')
        return { success: true }
      case 'press':
        console.log(`[ocbot:act] press "${action.args?.[0] || 'Enter'}"`)
        await cdpPress(tabId, action.args?.[0] || 'Enter')
        return { success: true }
      case 'hover': {
        console.log(`[ocbot:act] hover #${action.backendNodeId} ${action.roleName}`)
        const objectId = await resolveNode(tabId, action.backendNodeId)
        await scrollIntoView(tabId, objectId)
        const { x, y } = await getClickPoint(tabId, action.backendNodeId)
        await sendCdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
        await sendCdp(tabId, 'Runtime.releaseObject', { objectId })
        return { success: true }
      }
      default:
        return { success: false, error: `Unknown method: ${action.method}` }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[ocbot:act] ✗ ${action.method} ${action.roleName}: ${msg}`)
    return { success: false, error: msg }
  }
}

// --- Replay ---

async function replayActions(
  tabId: number,
  actions: ActionStep[],
  verifyClicks?: boolean,
): Promise<{ success: boolean; failedIndex: number; noEffect?: boolean }> {
  for (let i = 0; i < actions.length; i++) {
    // Capture snapshot before click if verification is enabled
    let beforeSnapshot: PageSnapshot | undefined
    if (verifyClicks && actions[i].method === 'click') {
      try {
        beforeSnapshot = await capturePageSnapshot(tabId)
      } catch {
        // Best effort
      }
    }

    const result = await executeAction(tabId, actions[i])
    if (!result.success) {
      return { success: false, failedIndex: i }
    }

    // Verify click had an effect
    if (beforeSnapshot && actions[i].method === 'click') {
      try {
        // Small delay to let DOM settle
        await new Promise((r) => setTimeout(r, 200))
        const afterSnapshot = await capturePageSnapshot(tabId)
        const diff = diffTrees(beforeSnapshot, afterSnapshot)
        if (!diff.changed && !diff.urlChanged) {
          logDebug('diff', 'Click effect', { changed: false })
          return { success: false, failedIndex: i, noEffect: true }
        }
        logDebug('diff', 'Click effect', { changed: true })
      } catch {
        // Best effort — don't fail on diff errors
      }
    }
  }
  return { success: true, failedIndex: -1 }
}

/**
 * Replay cached actions via XPath resolution.
 * For each action, resolve xpath → backendNodeId, then execute.
 * Returns updated actions with fresh backendNodeIds, or null if any XPath fails.
 */
async function replayCachedViaXPath(
  tabId: number,
  actions: ActionStep[],
  verifyClicks?: boolean,
): Promise<{ success: boolean; updatedActions: ActionStep[]; failedIndex: number; noEffect?: boolean }> {
  const updated: ActionStep[] = []

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]

    // press doesn't need a node
    if (action.method === 'press') {
      updated.push(action)
      const result = await executeAction(tabId, action)
      if (!result.success) {
        return { success: false, updatedActions: updated, failedIndex: i }
      }
      continue
    }

    // Resolve XPath to fresh backendNodeId
    const backendNodeId = await findByXPath(tabId, action.xpath)
    if (backendNodeId == null) {
      console.log(`[ocbot:act] XPath miss: ${action.xpath}`)
      return { success: false, updatedActions: updated, failedIndex: i }
    }

    const freshAction: ActionStep = { ...action, backendNodeId }
    updated.push(freshAction)

    // Capture before snapshot for click verification
    let beforeSnapshot: PageSnapshot | undefined
    if (verifyClicks && action.method === 'click') {
      try {
        beforeSnapshot = await capturePageSnapshot(tabId)
      } catch { /* best effort */ }
    }

    const result = await executeAction(tabId, freshAction)
    if (!result.success) {
      return { success: false, updatedActions: updated, failedIndex: i }
    }

    // Verify click effect
    if (beforeSnapshot && action.method === 'click') {
      try {
        await new Promise((r) => setTimeout(r, 200))
        const afterSnapshot = await capturePageSnapshot(tabId)
        const diff = diffTrees(beforeSnapshot, afterSnapshot)
        if (!diff.changed && !diff.urlChanged) {
          logDebug('diff', 'Click effect', { changed: false })
          return { success: false, updatedActions: updated, failedIndex: i, noEffect: true }
        }
        logDebug('diff', 'Click effect', { changed: true })
      } catch { /* best effort */ }
    }
  }

  return { success: true, updatedActions: updated, failedIndex: -1 }
}

// --- Self-heal: Stagehand style (re-snapshot + re-LLM) ---

async function selfHealRetry(
  tabId: number,
  instruction: string,
  gatewayUrl: string,
  model: string,
  signal?: AbortSignal,
): Promise<{ actions: ActionStep[]; description: string } | null> {
  try {
    console.log('[ocbot:act] selfHealRetry: re-snapshot + re-LLM...')
    const snapshot = await capturePageSnapshot(tabId)
    if (signal?.aborted) return null
    const result = await inferActions(instruction, snapshot, gatewayUrl, model, signal)
    return result
  } catch (err) {
    console.log('[ocbot:act] selfHealRetry failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// --- Two-step execution ---

async function executeTwoStep(
  tabId: number,
  firstAction: ActionStep,
  gatewayUrl: string,
  model: string,
  signal?: AbortSignal,
): Promise<{ success: boolean; actions: ActionStep[] }> {
  // Execute first step (e.g. open dropdown)
  const firstResult = await executeAction(tabId, firstAction)
  if (!firstResult.success) {
    return { success: false, actions: [firstAction] }
  }

  // Wait for DOM to settle after opening
  await new Promise((r) => setTimeout(r, 300))

  // Re-snapshot and infer second step
  const snapshot = await capturePageSnapshot(tabId)
  if (signal?.aborted) return { success: false, actions: [firstAction] }

  const stepTwo = await inferStepTwo(snapshot, firstAction.description, gatewayUrl, model, signal)
  if (!stepTwo.actions.length) {
    return { success: false, actions: [firstAction] }
  }

  // Execute second step
  const allActions = [firstAction, ...stepTwo.actions]
  for (const action of stepTwo.actions) {
    const result = await executeAction(tabId, action)
    if (!result.success) {
      return { success: false, actions: allActions }
    }
  }

  return { success: true, actions: allActions }
}

// --- Public API ---

/**
 * Direct node execution — bypasses LLM inference entirely.
 * Used when the agent already knows the nodeId from ariaTree.
 */
export async function actDirect(
  nodeId: number,
  method: string,
  value?: string,
  cache?: ActCache,
  signal?: AbortSignal,
  options?: ActOptions,
): Promise<ActResult> {
  const tabId = await getActiveTabId()
  await ensureAttached(tabId)

  // Resolve the node's role and name for a meaningful description
  let roleName = ''
  try {
    const snapshot = await capturePageSnapshot(tabId)
    const el = snapshot.elements.find(e => e.backendNodeId === nodeId)
    if (el) {
      roleName = buildRoleName(el.role, el.name)
    }
  } catch { /* best effort */ }

  const description = roleName
    ? `${method} ${roleName}${value ? ` "${value}"` : ''}`
    : `${method} on node ${nodeId}${value ? ` "${value}"` : ''}`

  const action: ActionStep = {
    method: method as ActionStep['method'],
    xpath: '',
    encodedId: `0-${nodeId}`,
    backendNodeId: nodeId,
    roleName,
    args: value ? [value] : undefined,
    description,
  }

  const result = await executeAction(tabId, action)
  return {
    success: result.success,
    actions: [action],
    description: action.description,
    cacheHit: false,
    selfHealed: false,
  }
}

export async function act(
  instruction: string,
  gatewayUrl: string,
  model: string,
  cache: ActCache,
  signal?: AbortSignal,
  options?: ActOptions,
): Promise<ActResult> {
  const tabId = await getActiveTabId()
  const url = await getActiveTabUrl()
  await ensureAttached(tabId)
  const verifyClicks = options?.skillReplay ?? false

  // 1. Check cache
  const cached = await cache.lookup(instruction, url)
  if (cached) {
    console.log('[ocbot:act] cache hit, replaying via XPath...')
    const replay = await replayCachedViaXPath(tabId, cached.actions, verifyClicks)

    if (replay.success) {
      console.log('[ocbot:act] ✓ XPath replay succeeded')
      return {
        success: true,
        actions: replay.updatedActions,
        description: cached.description,
        cacheHit: true,
        selfHealed: false,
      }
    }

    // XPath replay failed → selfHealRetry (re-snapshot + re-LLM)
    console.log('[ocbot:act] ✗ XPath replay failed, self-healing...')
    if (signal?.aborted) throw new Error('Aborted')

    const healed = await selfHealRetry(tabId, instruction, gatewayUrl, model, signal)
    if (!healed) {
      return { success: false, actions: [], description: 'Self-heal failed', cacheHit: false, selfHealed: true }
    }

    const healReplay = await replayActions(tabId, healed.actions, verifyClicks)

    return {
      success: healReplay.success,
      actions: healed.actions,
      description: healed.description,
      cacheHit: false,
      selfHealed: true,
    }
  }

  // 2. Cache miss — snapshot + LLM inference
  console.log('[ocbot:act] cache miss, inferring...')
  const snapshot = await capturePageSnapshot(tabId)
  if (signal?.aborted) throw new Error('Aborted')

  let inferResult: { actions: ActionStep[]; description: string }
  try {
    inferResult = await inferActions(instruction, snapshot, gatewayUrl, model, signal)
  } catch (err) {
    console.log('[ocbot:act] inference failed:', err instanceof Error ? err.message : err)
    return { success: false, actions: [], description: 'Inference failed', cacheHit: false, selfHealed: false }
  }

  console.log('[ocbot:act] inferred:', inferResult.actions.map(a =>
    `${a.method}(${a.roleName})`
  ).join(', '))

  // Empty actions = LLM couldn't find the target element
  if (inferResult.actions.length === 0) {
    console.log('[ocbot:act] ✗ LLM returned no actions (element not found)')
    return {
      success: false,
      actions: [],
      description: inferResult.description || 'No matching element found',
      cacheHit: false,
      selfHealed: false,
    }
  }

  // 3. Execute actions (with twoStep support)
  const allActions: ActionStep[] = []
  let allSuccess = true

  for (const action of inferResult.actions) {
    if (signal?.aborted) throw new Error('Aborted')

    if (action.twoStep) {
      const twoStepResult = await executeTwoStep(tabId, action, gatewayUrl, model, signal)
      allActions.push(...twoStepResult.actions)
      if (!twoStepResult.success) {
        allSuccess = false
        break
      }
    } else {
      allActions.push(action)
      const result = await executeAction(tabId, action)
      if (!result.success) {
        // Try selfHealRetry once
        console.log('[ocbot:act] execution failed, trying self-heal...')
        const healed = await selfHealRetry(tabId, instruction, gatewayUrl, model, signal)
        if (healed) {
          const healReplay = await replayActions(tabId, healed.actions, verifyClicks)
          if (healReplay.success) {
            return {
              success: true,
              actions: healed.actions,
              description: healed.description,
              cacheHit: false,
              selfHealed: true,
            }
          }
        }
        allSuccess = false
        break
      }
    }
  }

  console.log(`[ocbot:act] result: ${allSuccess ? '✓' : '✗'}`)

  return {
    success: allSuccess,
    actions: allActions,
    description: inferResult.description,
    cacheHit: false,
    selfHealed: false,
  }
}
