import type { ToolDefinition, LlmProvider } from '../llm/types'
import type { ActCache } from './cache'
import { act } from './act'
import { extract } from './extract'
import { observe } from './observe'

export const BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'act',
    description: 'Perform a browser action described in natural language. The system will automatically find the right element and interact with it. Examples: "click the Sign In button", "type hello@email.com in the email field", "select English from the language dropdown".',
    parameters: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language description of the action to perform' },
      },
      required: ['instruction'],
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
]

// --- Deterministic tool implementations (no LLM needed) ---

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

async function toolNavigate(args: { url: string }): Promise<string> {
  const tabId = await getActiveTabId()
  let url = args.url
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }
  await chrome.tabs.update(tabId, { url })
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
): Promise<string> {
  try {
    const args = JSON.parse(argsJson || '{}')
    switch (name) {
      case 'act': {
        const result = await act(args.instruction, provider, cache, signal)
        const status = result.cacheHit ? '(cache hit)' : result.selfHealed ? '(self-healed)' : '(new)'
        return JSON.stringify({
          success: result.success,
          description: result.description,
          actions: result.actions.map(a => a.description),
          status,
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
      default: return `Error: Unknown tool "${name}"`
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Error executing ${name}: ${msg}`
  }
}
