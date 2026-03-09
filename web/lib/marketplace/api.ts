const BASE_URL = 'https://raw.githubusercontent.com/instry/ocbot_skills/main'

export interface MarketplaceSkill {
  id: string
  skill_id: string
  author_id: string
  author_name: string
  name: string
  description: string
  categories: string  // JSON array string
  data: string        // full Skill JSON blob
  url_pattern: string // URL scope pattern
  clone_count: number
  version: number
  created_at: number
  updated_at: number
}

// --- In-memory cache for index.json ---

let cachedIndex: MarketplaceSkill[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getIndex(): Promise<MarketplaceSkill[]> {
  const now = Date.now()
  if (cachedIndex && now - cacheTimestamp < CACHE_TTL) return cachedIndex

  const res = await fetch(`${BASE_URL}/index.json`)
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`)
  const data: MarketplaceSkill[] = await res.json()
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
}): Promise<{ skills: MarketplaceSkill[]; total: number }> {
  let skills = await getIndex()

  // Filter by category
  if (params.category) {
    const cat = params.category.toLowerCase()
    skills = skills.filter(s => {
      try {
        const cats: string[] = JSON.parse(s.categories)
        return cats.some(c => c.toLowerCase() === cat)
      } catch {
        return false
      }
    })
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

export async function fetchMarketplaceSkill(id: string): Promise<MarketplaceSkill> {
  const res = await fetch(`${BASE_URL}/skills/${id}.json`)
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
}): Promise<{ skills: MarketplaceSkill[]; total: number }> {
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
