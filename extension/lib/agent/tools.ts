import type { ToolDefinition } from '../llm/types'

export const BROWSER_TOOLS: ToolDefinition[] = [
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
    name: 'click',
    description: 'Click an element on the page by CSS selector',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to click' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input element',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the input element' },
        text: { type: 'string', description: 'The text to type' },
        pressEnter: { type: 'string', description: 'Whether to press Enter after typing (true/false)', enum: ['true', 'false'] },
      },
      required: ['selector', 'text'],
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
    name: 'getText',
    description: 'Get the current page URL, title, and visible text content',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'getElements',
    description: 'Query elements on the page and get their tag, text, and attributes',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to query elements' },
        limit: { type: 'string', description: 'Maximum number of elements to return (default 10)' },
      },
      required: ['selector'],
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

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab found')
  return tab.id
}

async function executeInTab<T>(tabId: number, func: (...args: unknown[]) => T, args?: unknown[]): Promise<T> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: func as () => T,
    args: args || [],
  })
  if (results[0]?.result !== undefined) return results[0].result as T
  throw new Error('Script execution returned no result')
}

async function toolNavigate(args: { url: string }): Promise<string> {
  const tabId = await getActiveTabId()
  let url = args.url
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }
  await chrome.tabs.update(tabId, { url })
  // Wait for load
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

async function toolClick(args: { selector: string }): Promise<string> {
  const tabId = await getActiveTabId()
  return await executeInTab(tabId, (sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return `Error: No element found for selector "${sel}"`
    el.click()
    return `Clicked element: ${sel}`
  }, [args.selector]) as string
}

async function toolType(args: { selector: string; text: string; pressEnter?: string }): Promise<string> {
  const tabId = await getActiveTabId()
  return await executeInTab(tabId, (sel: string, text: string, pressEnter: string) => {
    const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null
    if (!el) return `Error: No element found for selector "${sel}"`
    el.focus()
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    if (pressEnter === 'true') {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
      // Also try form submit
      const form = el.closest('form')
      if (form) form.requestSubmit()
    }
    return `Typed "${text}" into ${sel}${pressEnter === 'true' ? ' and pressed Enter' : ''}`
  }, [args.selector, args.text, args.pressEnter || 'false']) as string
}

async function toolScroll(args: { direction: string }): Promise<string> {
  const tabId = await getActiveTabId()
  return await executeInTab(tabId, (dir: string) => {
    const amount = dir === 'up' ? -500 : 500
    window.scrollBy({ top: amount, behavior: 'smooth' })
    return `Scrolled ${dir} by 500px. Current scroll position: ${window.scrollY}px`
  }, [args.direction]) as string
}

async function toolGetText(): Promise<string> {
  const tabId = await getActiveTabId()
  return await executeInTab(tabId, () => {
    const text = document.body?.innerText?.slice(0, 5000) || ''
    return JSON.stringify({
      url: window.location.href,
      title: document.title,
      text,
    })
  }) as string
}

async function toolGetElements(args: { selector: string; limit?: string }): Promise<string> {
  const tabId = await getActiveTabId()
  return await executeInTab(tabId, (sel: string, lim: string) => {
    const limit = parseInt(lim) || 10
    const elements = Array.from(document.querySelectorAll(sel)).slice(0, limit)
    const results = elements.map((el, i) => {
      const attrs: Record<string, string> = {}
      for (const attr of el.attributes) {
        if (['id', 'class', 'href', 'src', 'type', 'name', 'value', 'placeholder', 'aria-label', 'role'].includes(attr.name)) {
          attrs[attr.name] = attr.value
        }
      }
      return {
        index: i,
        tag: el.tagName.toLowerCase(),
        text: (el as HTMLElement).innerText?.slice(0, 100) || '',
        attrs,
      }
    })
    return JSON.stringify(results)
  }, [args.selector, args.limit || '10']) as string
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

export async function executeTool(name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson || '{}')
    switch (name) {
      case 'navigate': return await toolNavigate(args)
      case 'click': return await toolClick(args)
      case 'type': return await toolType(args)
      case 'scroll': return await toolScroll(args)
      case 'getText': return await toolGetText()
      case 'getElements': return await toolGetElements(args)
      case 'waitForNavigation': return await toolWaitForNavigation(args)
      default: return `Error: Unknown tool "${name}"`
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Error executing ${name}: ${msg}`
  }
}
