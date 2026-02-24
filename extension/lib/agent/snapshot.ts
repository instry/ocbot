export interface PageElement {
  index: number
  tag: string
  role?: string
  text: string
  selector: string
  attributes: Record<string, string>
  interactable: boolean
}

export interface PageSnapshot {
  url: string
  title: string
  elements: PageElement[]
  text: string
}

/**
 * Generate a unique CSS selector for an element, executed in the page context.
 */
function generateUniqueSelector(el: Element): string {
  // 1. ID selector
  if (el.id) {
    const sel = `#${CSS.escape(el.id)}`
    if (document.querySelectorAll(sel).length === 1) return sel
  }

  // 2. data-testid
  const testId = el.getAttribute('data-testid')
  if (testId) {
    const sel = `[data-testid="${CSS.escape(testId)}"]`
    if (document.querySelectorAll(sel).length === 1) return sel
  }

  // 3. aria-label
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) {
    const tag = el.tagName.toLowerCase()
    const sel = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`
    if (document.querySelectorAll(sel).length === 1) return sel
  }

  // 4. name attribute
  const name = el.getAttribute('name')
  if (name) {
    const tag = el.tagName.toLowerCase()
    const sel = `${tag}[name="${CSS.escape(name)}"]`
    if (document.querySelectorAll(sel).length === 1) return sel
  }

  // 5. Build a path using tag + nth-of-type
  const parts: string[] = []
  let current: Element | null = el
  while (current && current !== document.documentElement) {
    const tag = current.tagName
    let part = tag.toLowerCase()
    const parent: Element | null = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c: Element) => c.tagName === tag,
      )
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1
        part += `:nth-of-type(${idx})`
      }
    }
    parts.unshift(part)
    current = parent
    // Stop building path once we get a unique selector
    const sel = parts.join(' > ')
    if (document.querySelectorAll(sel).length === 1) return sel
  }
  return parts.join(' > ')
}

/**
 * Content script function injected into the page to collect snapshot.
 * Must be self-contained (no external references).
 */
function collectSnapshot(): PageSnapshot {
  const INTERACTABLE_TAGS = new Set([
    'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
  ])
  const INTERACTABLE_ROLES = new Set([
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
    'option', 'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton',
  ])
  const ATTR_PICK = ['id', 'class', 'href', 'type', 'name', 'value', 'placeholder', 'aria-label', 'role', 'data-testid']

  // Unique selector generation (inlined for content script)
  function genSelector(el: Element): string {
    if (el.id) {
      const sel = `#${CSS.escape(el.id)}`
      if (document.querySelectorAll(sel).length === 1) return sel
    }
    const testId = el.getAttribute('data-testid')
    if (testId) {
      const sel = `[data-testid="${CSS.escape(testId)}"]`
      if (document.querySelectorAll(sel).length === 1) return sel
    }
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) {
      const tag = el.tagName.toLowerCase()
      const sel = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`
      if (document.querySelectorAll(sel).length === 1) return sel
    }
    const name = el.getAttribute('name')
    if (name) {
      const tag = el.tagName.toLowerCase()
      const sel = `${tag}[name="${CSS.escape(name)}"]`
      if (document.querySelectorAll(sel).length === 1) return sel
    }
    // Path-based selector
    const parts: string[] = []
    let cur: Element | null = el
    while (cur && cur !== document.documentElement) {
      const curTag = cur.tagName
      let part = curTag.toLowerCase()
      const parent: Element | null = cur.parentElement
      if (parent) {
        const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === curTag)
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1
          part += `:nth-of-type(${idx})`
        }
      }
      parts.unshift(part)
      cur = parent
      const sel = parts.join(' > ')
      if (document.querySelectorAll(sel).length === 1) return sel
    }
    return parts.join(' > ')
  }

  function isVisible(el: HTMLElement): boolean {
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false
    const style = getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
  }

  function isInteractable(el: Element): boolean {
    const tag = el.tagName.toLowerCase()
    if (INTERACTABLE_TAGS.has(tag)) return true
    const role = el.getAttribute('role')
    if (role && INTERACTABLE_ROLES.has(role)) return true
    if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true
    if ((el as HTMLElement).contentEditable === 'true') return true
    return false
  }

  const elements: PageElement[] = []
  const allEls = document.querySelectorAll('body *')
  let index = 0

  for (const el of allEls) {
    const htmlEl = el as HTMLElement
    if (!isVisible(htmlEl)) continue

    const interactable = isInteractable(el)
    // Only include interactable elements to keep snapshot compact
    if (!interactable) continue

    const attrs: Record<string, string> = {}
    for (const attrName of ATTR_PICK) {
      const val = el.getAttribute(attrName)
      if (val) attrs[attrName] = val
    }

    elements.push({
      index,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || undefined,
      text: (htmlEl.innerText || htmlEl.textContent || '').trim().slice(0, 100),
      selector: genSelector(el),
      attributes: attrs,
      interactable,
    })
    index++

    // Cap at 500 elements to avoid huge snapshots
    if (index >= 500) break
  }

  return {
    url: window.location.href,
    title: document.title,
    elements,
    text: (document.body?.innerText || '').slice(0, 5000),
  }
}

/**
 * Capture a page snapshot by injecting a content script into the active tab.
 */
export async function capturePageSnapshot(tabId: number): Promise<PageSnapshot> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectSnapshot,
  })
  if (results[0]?.result) return results[0].result as PageSnapshot
  throw new Error('Failed to capture page snapshot')
}
