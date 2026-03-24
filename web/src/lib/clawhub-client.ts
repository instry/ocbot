/**
 * Lightweight HTTP client for the public ClawHub REST API.
 * Uses the /api/v1/packages/* endpoints (the /api/v1/skills endpoint returns empty).
 */

const CLAWHUB_BASE = 'https://clawhub.ai'
const FETCH_TIMEOUT_MS = 15_000

// ── Types (aligned with ClawHubPackageListItem from openclaw) ──

export interface MarketplaceSkill {
  name: string
  displayName: string
  family: string
  channel: string        // "official" | "community" | "private"
  isOfficial: boolean
  summary?: string | null
  ownerHandle?: string | null
  ownerDisplayName?: string | null
  ownerImage?: string | null
  createdAt: number
  updatedAt: number
  latestVersion?: string | null
  starCount?: number
  installCount?: number
  capabilityTags?: string[]
  executesCode?: boolean
  verificationTier?: string | null
  runtimeId?: string | null
}

export interface MarketplaceSearchResult {
  score: number
  package: MarketplaceSkill
}

export interface MarketplaceSkillDetail {
  package: (MarketplaceSkill & {
    tags?: Record<string, string>
    compatibility?: {
      pluginApiRange?: string
      builtWithOpenClawVersion?: string
      minGatewayVersion?: string
    } | null
    capabilities?: {
      executesCode?: boolean
      capabilityTags?: string[]
      hostTargets?: string[]
    } | null
    verification?: {
      tier?: string
      scope?: string
      summary?: string
      sourceRepo?: string
      hasProvenance?: boolean
      scanStatus?: string
    } | null
  }) | null
  owner?: {
    handle?: string | null
    displayName?: string | null
    image?: string | null
  } | null
}

export interface MarketplaceSkillVersion {
  package: { name: string; displayName: string; family: string } | null
  version: {
    version: string
    createdAt: number
    changelog: string
  } | null
}

export interface MarketplaceSearchResponse {
  results: MarketplaceSearchResult[]
  total?: number
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

/** Search for skills on ClawHub marketplace. Query is required by the API. */
export async function searchMarketplaceSkills(query: string, limit = 30): Promise<MarketplaceSearchResponse> {
  const q = query.trim()
  if (!q) return { results: [], total: 0 }
  try {
    const result = await fetchJson<{ results: MarketplaceSearchResult[]; total?: number }>(
      '/api/v1/packages/search',
      { q, family: 'skill', limit: String(limit) },
    )
    return { results: result.results ?? [], total: result.total }
  } catch {
    return { results: [], total: undefined }
  }
}

/** Browse marketplace skills. Uses a broad single-char query since the API requires a search term. */
export async function browseMarketplaceSkills(limit = 50): Promise<MarketplaceSearchResponse> {
  // The packages/search endpoint requires a query; use a wildcard-like broad query
  return searchMarketplaceSkills('a', limit)
}

/** Get full detail for a single package. */
export async function getMarketplaceSkillDetail(name: string): Promise<MarketplaceSkillDetail | null> {
  try {
    return await fetchJson<MarketplaceSkillDetail>(`/api/v1/packages/${encodeURIComponent(name)}`)
  } catch {
    return null
  }
}

/** Get version detail (changelog). */
export async function getMarketplaceSkillVersion(name: string, version: string): Promise<MarketplaceSkillVersion | null> {
  try {
    return await fetchJson<MarketplaceSkillVersion>(
      `/api/v1/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`,
    )
  } catch {
    return null
  }
}
