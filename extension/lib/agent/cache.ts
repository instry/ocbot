import type { PageElement } from './snapshot'

export interface ActionStep {
  method: 'click' | 'type' | 'select' | 'press'
  backendNodeId: number
  roleName: string
  args?: string[]
  description: string
}

export interface CachedAction {
  version: 2
  instruction: string
  url: string
  actions: ActionStep[]
  description: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'ocbot_act_cache'
const MAX_ENTRIES = 500

async function computeHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function normalizeInstruction(instruction: string): string {
  return instruction.trim().toLowerCase()
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return url
  }
}

function buildCacheInput(instruction: string, url: string): string {
  return JSON.stringify({
    instruction: normalizeInstruction(instruction),
    urlPattern: normalizeUrl(url),
  })
}

/**
 * Build a roleName string for an element: "role:name"
 */
export function buildRoleName(role: string, name: string): string {
  return `${role}:${name}`
}

/**
 * Find an element in the current snapshot by roleName fuzzy match.
 * Returns the matching element or null.
 */
export function fuzzyMatchByRoleName(
  roleName: string,
  elements: PageElement[],
): PageElement | null {
  const [role, ...nameParts] = roleName.split(':')
  const name = nameParts.join(':')

  // Exact match first
  const exact = elements.find(
    (el) => el.role === role && el.name === name && el.interactable,
  )
  if (exact) return exact

  // Case-insensitive name match with same role
  const nameLower = name.toLowerCase()
  const caseInsensitive = elements.find(
    (el) =>
      el.role === role &&
      el.name.toLowerCase() === nameLower &&
      el.interactable,
  )
  if (caseInsensitive) return caseInsensitive

  // Partial name match (name contains or is contained)
  const partial = elements.find(
    (el) =>
      el.role === role &&
      el.interactable &&
      (el.name.toLowerCase().includes(nameLower) ||
        nameLower.includes(el.name.toLowerCase())) &&
      el.name.length > 0,
  )
  return partial || null
}

export class ActCache {
  private async getAll(): Promise<Record<string, CachedAction>> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return (result[STORAGE_KEY] as Record<string, CachedAction>) || {}
  }

  private async setAll(data: Record<string, CachedAction>): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: data })
  }

  async lookup(instruction: string, url: string): Promise<CachedAction | null> {
    const key = await computeHash(buildCacheInput(instruction, url))
    const all = await this.getAll()
    const entry = all[key]
    if (!entry) return null
    // Touch updatedAt for LRU
    entry.updatedAt = Date.now()
    all[key] = entry
    await this.setAll(all)
    return entry
  }

  async store(
    instruction: string,
    url: string,
    actions: ActionStep[],
    description: string,
  ): Promise<void> {
    const key = await computeHash(buildCacheInput(instruction, url))
    const all = await this.getAll()

    // LRU eviction if at capacity
    const keys = Object.keys(all)
    if (keys.length >= MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0))
      const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES + 1)
      for (const k of toRemove) delete all[k]
    }

    all[key] = {
      version: 2,
      instruction: normalizeInstruction(instruction),
      url: normalizeUrl(url),
      actions,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await this.setAll(all)
  }

  async update(instruction: string, url: string, actions: ActionStep[]): Promise<void> {
    const key = await computeHash(buildCacheInput(instruction, url))
    const all = await this.getAll()
    const entry = all[key]
    if (entry) {
      entry.actions = actions
      entry.updatedAt = Date.now()
      all[key] = entry
      await this.setAll(all)
    }
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEY)
  }
}
