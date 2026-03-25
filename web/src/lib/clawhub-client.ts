/**
 * Lightweight HTTP client for the public ClawHub REST API.
 * Uses /api/v1/packages/* endpoints for browsing and search.
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

export interface MarketplaceListResponse {
  items: MarketplaceSkill[]
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

/**
 * List skills from ClawHub marketplace (paginated).
 * Tries /api/v1/packages?family=skill first, which returns all packages.
 * The response may use "items", "results", or "packages" as the array key.
 */
export async function listMarketplaceSkills(limit = 100, offset = 0): Promise<MarketplaceListResponse> {
  const raw = await fetchJson<Record<string, unknown>>(
    '/api/v1/packages',
    { family: 'skill', limit: String(limit), offset: String(offset) },
  )
  // Normalize: API may return array under different keys
  const arr = (raw.items ?? raw.results ?? raw.packages ?? []) as MarketplaceSkill[]
  const total = (raw.total ?? raw.count ?? raw.totalCount) as number | undefined
  console.log('[clawhub] list response keys:', Object.keys(raw), 'items:', arr.length, 'total:', total)
  return { items: arr, total }
}

/** Search for skills on ClawHub marketplace. */
export async function searchMarketplaceSkills(query: string, limit = 30): Promise<MarketplaceSearchResponse> {
  const q = query.trim()
  if (!q) return { results: [], total: 0 }
  const raw = await fetchJson<Record<string, unknown>>(
    '/api/v1/packages/search',
    { q, family: 'skill', limit: String(limit) },
  )
  // Normalize: search results may be wrapped in { score, package } or be flat
  const results = (raw.results ?? raw.items ?? []) as MarketplaceSearchResult[]
  const total = (raw.total ?? raw.count ?? raw.totalCount) as number | undefined
  console.log('[clawhub] search response keys:', Object.keys(raw), 'results:', results.length, 'total:', total)
  return { results, total }
}

/** Browse marketplace skills (convenience wrapper for first page). */
export async function browseMarketplaceSkills(limit = 100): Promise<MarketplaceListResponse> {
  return listMarketplaceSkills(limit, 0)
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
