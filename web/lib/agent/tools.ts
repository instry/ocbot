import type { ToolDefinition, LlmProvider } from '../llm/types'
import type { ActCache } from './cache'
import type { Variables } from './variables'
import { act, actDirect, type ActOptions } from './act'
import { extract } from './extract'
import { observe } from './observe'
import { fillForm } from './fillForm'
import { capturePageSnapshot } from './snapshot'
import { ensureAttached, sendCdp } from './cdp'
import { substituteVariables } from './variables'
import { sendMessage } from '../messaging'
import { isDesktopTool, executeDesktopTool } from '../desktop/tools'

export const BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'act',
    description: 'Perform a browser action. If you have the nodeId from ariaTree, provide it with method for fast direct execution (no extra LLM call). Otherwise provide instruction for natural language execution.',
    parameters: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language description of the action (used when nodeId is not provided)' },
        nodeId: { type: 'number', description: 'Element nodeId from ariaTree for direct execution' },
        method: { type: 'string', description: 'Action method', enum: ['click', 'type', 'fill', 'select', 'press', 'hover'] },
        value: { type: 'string', description: 'Value for type/fill/select/press actions' },
        x: { type: 'number', description: 'X pixel coordinate for coordinate-based click (use after seeing a screenshot)' },
        y: { type: 'number', description: 'Y pixel coordinate for coordinate-based click (use after seeing a screenshot)' },
      },
      required: [],
    },
  },
  {
    name: 'extract',
    description: 'Extract structured information from the current page. Examples: "get all article titles", "extract the price and product name", "list all links in the navigation".',
    parameters: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'What information to extract from the page' },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'observe',
    description: 'Explore what actions are available on the current page. Returns a list of possible interactions. Use this to understand a page before acting. Examples: "what can I click on?", "find login-related elements", "list form fields".',
    parameters: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'What kind of actions or elements to look for' },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'navigate',
    description: 'Navigate the current tab to a URL',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page up or down',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', description: 'Direction to scroll', enum: ['up', 'down'] },
      },
      required: ['direction'],
    },
  },
  {
    name: 'waitForNavigation',
    description: 'Wait for the page to finish loading',
    parameters: {
      type: 'object',
      properties: {
        timeout: { type: 'string', description: 'Maximum wait time in ms (default 5000)' },
      },
    },
  },
  {
    name: 'think',
    description: 'Think through a problem step-by-step before acting. No browser side effects.',
    parameters: {
      type: 'object',
      properties: {
        reasoning: { type: 'string', description: 'Your step-by-step reasoning' },
      },
      required: ['reasoning'],
    },
  },
  {
    name: 'ariaTree',
    description: 'Get the accessibility tree of the current page. Shows all elements with roles, names, values and node IDs. Use to understand page structure before acting.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the current page. Use this to visually verify the page state, identify icon-only buttons, disambiguate similar elements, or confirm actions succeeded. Returns the image for visual inspection.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'fillForm',
    description: 'Fill multiple form fields at once. More efficient than calling act repeatedly. Use %variableName% for sensitive values if variables are available.',
    parameters: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'List of form fields to fill',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Description of the field, e.g. "email address", "password"' },
              value: { type: 'string', description: 'Value to type, e.g. "hello@test.com" or "%email%"' },
            },
            required: ['field', 'value'],
          },
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'readPageContent',
    description: 'Read the text content of the current page. Returns clean article text (stripped of navigation, ads, etc). Use for reading, summarizing, or analyzing page content.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
]

// --- Deterministic tool implementations (no LLM needed) ---

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

async function toolNavigate(args: { url: string }): Promise<string> {
  let url = args.url
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }
  const newTab = await chrome.tabs.create({ url })
  const tabId = newTab.id!
  await new Promise<void>((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, 10000)
  })
  const tab = await chrome.tabs.get(tabId)
  return JSON.stringify({ url: tab.url, title: tab.title })
}

async function toolScroll(args: { direction: string }): Promise<string> {
  const tabId = await getActiveTabId()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dir: string) => {
      const amount = dir === 'up' ? -500 : 500
      window.scrollBy({ top: amount, behavior: 'smooth' })
      return `Scrolled ${dir} by 500px. Current scroll position: ${window.scrollY}px`
    },
    args: [args.direction],
  })
  if (results[0]?.result !== undefined) return results[0].result as string
  throw new Error('Script execution returned no result')
}

async function toolWaitForNavigation(args: { timeout?: string }): Promise<string> {
  const tabId = await getActiveTabId()
  const timeout = parseInt(args.timeout || '5000') || 5000

  const tab = await chrome.tabs.get(tabId)
  if (tab.status === 'complete') {
    return JSON.stringify({ status: 'already_loaded', url: tab.url })
  }

  await new Promise<void>((resolve) => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, timeout)
  })

  const updated = await chrome.tabs.get(tabId)
  return JSON.stringify({ status: 'loaded', url: updated.url, title: updated.title })
}

// --- Main dispatcher ---

export async function executeTool(
  name: string,
  argsJson: string,
  provider: LlmProvider,
  cache: ActCache,
  signal?: AbortSignal,
  variables?: Variables,
  options?: ActOptions,
): Promise<string> {
  try {
    const args = JSON.parse(argsJson || '{}')
    switch (name) {
      case 'act': {
        // Coordinate-based click — direct pixel click, no DOM needed
        if (args.x != null && args.y != null) {
          const tabId = await getActiveTabId()
          await ensureAttached(tabId)
          const { data } = await sendCdp<{ data: string }>(tabId, 'Page.captureScreenshot', {
            format: 'jpeg', quality: 70, optimizeForSpeed: true,
          })
          // Scroll and click at coordinates
          await chrome.scripting.executeScript({
            target: { tabId },
            func: (px: number, py: number) => {
              const vw = window.innerWidth
              const vh = window.innerHeight
              const sx = Math.max(0, px - vw / 2)
              const sy = Math.max(0, py - vh / 2)
              window.scrollTo(sx, sy)
            },
            args: [args.x, args.y],
          })
          await new Promise((r) => setTimeout(r, 100))
          const scrollResult = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({ scrollX: window.scrollX, scrollY: window.scrollY }),
          })
          const scroll = scrollResult[0]?.result ?? { scrollX: 0, scrollY: 0 }
          const vx = args.x - scroll.scrollX
          const vy = args.y - scroll.scrollY
          await sendCdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: vx, y: vy })
          await sendCdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: vx, y: vy, button: 'left', clickCount: 1 })
          await sendCdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: vx, y: vy, button: 'left', clickCount: 1 })
          return JSON.stringify({ success: true, description: `click at (${args.x}, ${args.y})`, status: '(coordinate)' })
        }
        if (args.nodeId != null && args.method) {
          // Direct execution — no LLM inference needed
          const result = await actDirect(args.nodeId, args.method, args.value, cache, signal)
          return JSON.stringify({
            success: result.success,
            description: result.description,
            actions: result.actions.map(a => a.description),
            status: '(direct)',
          })
        }
        // Fallback: natural language instruction (existing behavior)
        const instruction = variables
          ? substituteVariables(args.instruction, variables)
          : args.instruction
        const result = await act(instruction, provider, cache, signal, options)
        const status = result.cacheHit ? '(cache hit)' : result.selfHealed ? '(self-healed)' : '(new)'
        return JSON.stringify({
          success: result.success,
          description: result.description,
          actions: result.actions.map(a => a.description),
          status,
          selfHealed: result.selfHealed,
          noEffect: result.noEffect,
        })
      }
      case 'extract': {
        const result = await extract(args.instruction, provider, signal)
        if (!result.success) return `Error extracting: ${result.error}`
        return JSON.stringify(result.data)
      }
      case 'observe': {
        const result = await observe(args.instruction, provider, signal)
        if (!result.success) return `Error observing: ${result.error}`
        return JSON.stringify(result.actions)
      }
      case 'navigate': return await toolNavigate(args)
      case 'scroll': return await toolScroll(args)
      case 'waitForNavigation': return await toolWaitForNavigation(args)
      case 'think': {
        return JSON.stringify({ acknowledged: true, reasoning: args.reasoning })
      }
      case 'ariaTree': {
        const tabId = await getActiveTabId()
        await ensureAttached(tabId)
        const snapshot = await capturePageSnapshot(tabId)
        // Truncate tree to ~70k chars to stay within context limits
        const maxLen = 70000
        const tree = snapshot.tree.length > maxLen
          ? snapshot.tree.slice(0, maxLen) + '\n... (truncated)'
          : snapshot.tree
        return JSON.stringify({
          url: snapshot.url,
          title: snapshot.title,
          elementCount: snapshot.elements.length,
          tree,
        })
      }
      case 'screenshot': {
        const tabId = await getActiveTabId()
        await ensureAttached(tabId)
        const { data } = await sendCdp<{ data: string }>(tabId, 'Page.captureScreenshot', {
          format: 'jpeg',
          quality: 70,
          optimizeForSpeed: true,
        })
        // Return special JSON marker — loop.ts will inject image into messages
        return JSON.stringify({ __screenshot__: true, data, sizeKB: Math.round(data.length / 1024) })
      }
      case 'fillForm': {
        const result = await fillForm(args.fields || [], provider, cache, signal, variables)
        return JSON.stringify({
          success: result.success,
          fields: result.fields.map(f => ({
            field: f.field,
            success: f.success,
            error: f.error,
          })),
        })
      }
      case 'readPageContent': {
        const tabId = await getActiveTabId()
        const article = await sendMessage('getArticleContent', undefined, tabId)
        return JSON.stringify({
          url: article.url,
          title: article.title,
          byline: article.byline,
          content: article.content,
          length: article.length,
        })
      }
      default:
        if (isDesktopTool(name)) {
          return await executeDesktopTool(name, argsJson)
        }
        return `Error: Unknown tool "${name}"`
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Error executing ${name}: ${msg}`
  }
}
