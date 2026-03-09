import type { Skill } from '@/lib/skills/types'

const BASE_URL = 'https://raw.githubusercontent.com/instry/ocbot_skills/main'

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

// --- In-memory cache for index.json ---

let cachedIndex: MarketplaceSkillSummary[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getIndex(): Promise<MarketplaceSkillSummary[]> {
  const now = Date.now()
  if (cachedIndex && now - cacheTimestamp < CACHE_TTL) return cachedIndex

  const res = await fetch(`${BASE_URL}/index.json`)
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`)
  const data: MarketplaceSkillSummary[] = await res.json()
  cachedIndex = data
  cacheTimestamp = now
  return data
}

// --- Public endpoints ---

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

/** Fetch full skill data (RealSkill) from the marketplace */
export async function fetchMarketplaceSkill(id: string): Promise<Skill> {
  const res = await fetch(`${BASE_URL}/skills/${id}/skill.json`)
  if (!res.ok) throw new Error(`Failed to fetch marketplace skill: ${res.status}`)
  return res.json()
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
