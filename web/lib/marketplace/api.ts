import type { Skill } from '@/lib/skills/types'
import { storage } from '@/lib/storage-backend'

const BASE_URL = 'https://raw.githubusercontent.com/instry/ocbot_skills/main'
const CACHE_KEY = 'ocbot_marketplace_cache'
const ALARM_NAME = 'ocbot_marketplace_sync'
const SYNC_INTERVAL_MINUTES = 5

/** Summary entry in index.json — enough for list display */
export interface MarketplaceSkillSummary {
  id: string
  name: string
  description: string
  author: string
  categories: string[]
  url_pattern: string
  version: number
}

interface MarketplaceCache {
  index: MarketplaceSkillSummary[]
  skills: Record<string, Skill>  // id -> full skill data
  updatedAt: number
}

// --- In-memory cache (backed by chrome.storage.local) ---

let cache: MarketplaceCache | null = null

async function loadCache(): Promise<MarketplaceCache> {
  if (cache) return cache
  const result = await storage.get(CACHE_KEY)
  cache = (result[CACHE_KEY] as MarketplaceCache) || { index: [], skills: {}, updatedAt: 0 }
  return cache
}

async function saveCache(): Promise<void> {
  if (cache) await storage.set({ [CACHE_KEY]: cache })
}

/** Fetch latest index from GitHub and update cache */
export async function syncMarketplace(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/index.json`)
    if (!res.ok) return
    const index: MarketplaceSkillSummary[] = await res.json()

    const c = await loadCache()
    c.index = index
    c.updatedAt = Date.now()
    await saveCache()
  } catch {
    // Network error — keep existing cache
  }
}

/** Setup chrome.alarms for periodic sync (call from background script) */
export function setupMarketplaceSync(): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: SYNC_INTERVAL_MINUTES })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) syncMarketplace()
  })
  // Initial sync on startup
  syncMarketplace()
}

// --- Public endpoints ---

async function getIndex(): Promise<MarketplaceSkillSummary[]> {
  const c = await loadCache()
  if (c.index.length === 0) {
    await syncMarketplace()
    return (await loadCache()).index
  }
  return c.index
}

export async function fetchMarketplaceSkills(params: {
  category?: string
  q?: string
  offset?: number
  limit?: number
}): Promise<{ skills: MarketplaceSkillSummary[]; total: number }> {
  let skills = await getIndex()

  // Filter by category
  if (params.category) {
    const cat = params.category.toLowerCase()
    skills = skills.filter(s =>
      s.categories.some(c => c.toLowerCase() === cat),
    )
  }

  // Filter by query (name or description)
  if (params.q) {
    const q = params.q.toLowerCase()
    skills = skills.filter(
      s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    )
  }

  const total = skills.length
  const offset = params.offset ?? 0
  const limit = params.limit ?? 30
  skills = skills.slice(offset, offset + limit)

  return { skills, total }
}

/** Fetch full skill data (RealSkill) from the marketplace, with cache */
export async function fetchMarketplaceSkill(id: string): Promise<Skill> {
  const c = await loadCache()

  // Return from cache if available
  if (c.skills[id]) return c.skills[id]

  // Fetch from GitHub
  const res = await fetch(`${BASE_URL}/skills/${id}/skill.json`)
  if (!res.ok) throw new Error(`Failed to fetch marketplace skill: ${res.status}`)
  const skill: Skill = await res.json()

  // Cache the skill
  c.skills[id] = skill
  await saveCache()

  return skill
}

export async function cloneSkill(_publishedId: string): Promise<void> {
  // no-op — no server to track clone counts
}

/** Discover marketplace skills by URL (client-side prefix match on url_pattern). */
export async function discoverSkills(params: {
  url: string
  instruction?: string
  limit?: number
}): Promise<{ skills: MarketplaceSkillSummary[]; total: number }> {
  let skills = await getIndex()

  // Filter by url_pattern prefix match
  skills = skills.filter(s => {
    if (!s.url_pattern) return false
    return params.url.startsWith(s.url_pattern)
  })

  // Filter by instruction/query
  if (params.instruction) {
    const q = params.instruction.toLowerCase()
    skills = skills.filter(
      s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    )
  }

  const total = skills.length
  if (params.limit) skills = skills.slice(0, params.limit)

  return { skills, total }
}
