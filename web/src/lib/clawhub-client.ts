/**
 * Lightweight HTTP client for the public ClawHub REST API.
 * Used by the Skills view to browse and search the marketplace.
 */

const CLAWHUB_BASE = 'https://clawhub.ai'
const FETCH_TIMEOUT_MS = 10_000

// ── Types ──

export interface ClawHubSkillListItem {
  slug: string
  displayName: string
  summary?: string
  tags?: Record<string, string>
  latestVersion?: { version: string; createdAt: number; changelog?: string }
  metadata?: { os?: string[] | null; systems?: string[] | null }
  createdAt: number
  updatedAt: number
}

export interface ClawHubSkillSearchResult {
  score: number
  slug: string
  displayName: string
  summary?: string
  version?: string
  updatedAt?: number
}

export interface ClawHubSkillDetail {
  skill: {
    slug: string
    displayName: string
    summary?: string
    tags?: Record<string, string>
    createdAt: number
    updatedAt: number
  } | null
  latestVersion?: { version: string; createdAt: number; changelog?: string } | null
  metadata?: { os?: string[] | null; systems?: string[] | null } | null
  owner?: { handle?: string | null; displayName?: string | null; image?: string | null } | null
}

// ── Helpers ──

async function fetchJson<T>(path: string, search?: Record<string, string>): Promise<T> {
  const url = new URL(path, CLAWHUB_BASE)
  if (search) {
    for (const [k, v] of Object.entries(search)) {
      if (v) url.searchParams.set(k, v)
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`ClawHub ${path} failed (${res.status})`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// ── API ──

export async function listClawHubSkills(limit = 30): Promise<ClawHubSkillListItem[]> {
  try {
    const result = await fetchJson<{ items: ClawHubSkillListItem[] }>(
      '/api/v1/skills',
      { limit: String(limit) },
    )
    return result.items ?? []
  } catch {
    return []
  }
}

export async function searchClawHubSkills(query: string, limit = 20): Promise<ClawHubSkillSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const result = await fetchJson<{ results: ClawHubSkillSearchResult[] }>(
      '/api/v1/search',
      { q, limit: String(limit) },
    )
    return result.results ?? []
  } catch {
    return []
  }
}

export async function getClawHubSkillDetail(slug: string): Promise<ClawHubSkillDetail | null> {
  try {
    return await fetchJson<ClawHubSkillDetail>(`/api/v1/skills/${encodeURIComponent(slug)}`)
  } catch {
    return null
  }
}
