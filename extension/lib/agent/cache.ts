export interface ActionStep {
  method: 'click' | 'type' | 'select' | 'press'
  selector: string
  args?: string[]
  description: string
}

export interface CachedAction {
  version: 1
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
      version: 1,
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
