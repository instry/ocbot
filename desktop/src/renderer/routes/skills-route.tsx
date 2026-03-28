import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowLeft, Search, RefreshCw, LayoutGrid, List, ChevronDown, Check, X,
  Eye, EyeOff, ExternalLink, Download, Star,
} from 'lucide-react'
import { getGatewayClient } from '@/gateway'
import { cn } from '@/lib/utils'

// ── Types ──

interface Requirements { bins?: string[]; env?: string[]; config?: string[] }
interface SkillInstallOption { id: string; kind: string; label: string; bins: string[] }
interface SkillStatusEntry {
  name: string; description: string; source: string; bundled: boolean; filePath: string; baseDir: string
  skillKey: string; primaryEnv?: string; emoji?: string; homepage?: string; always: boolean; disabled: boolean
  blockedByAllowlist: boolean; eligible: boolean; requirements: Requirements; missing: Requirements
  configChecks: Array<{ path: string; satisfied: boolean; note?: string }>; install: SkillInstallOption[]
}
interface SkillStatusReport { workspaceDir: string; managedSkillsDir: string; skills: SkillStatusEntry[] }

interface ClawHubSkillStats { downloads: number; installsCurrent?: number; installsAllTime?: number; stars: number; versions: number; comments: number }
interface ClawHubSkill {
  _id: string; slug: string; displayName: string; summary: string | null; ownerUserId: string
  stats: ClawHubSkillStats; badges?: { highlighted?: object; official?: object; deprecated?: object }
  createdAt: number; updatedAt: number
}
interface ClawHubListEntry {
  skill: ClawHubSkill; latestVersion: { version: string; createdAt: number; changelog?: string } | null
  ownerHandle?: string | null; owner?: { handle?: string; displayName?: string; image?: string } | null
}
interface ClawHubSearchResult {
  skill: ClawHubSkill; version?: { version: string } | null; score: number; slug?: string
  displayName?: string; summary?: string | null; ownerHandle?: string | null
  owner?: { handle?: string; displayName?: string; image?: string } | null
}
interface ClawHubClawdis {
  requires?: { bins?: string[]; anyBins?: string[]; env?: string[]; config?: string[] }
  primaryEnv?: string; emoji?: string; os?: string[]
  envVars?: Array<{ name: string; required?: boolean; description?: string }>
  dependencies?: Array<{ name: string; type?: string; version?: string; url?: string; repository?: string }>
  install?: Array<{ id?: string; kind: string; label?: string; bins?: string[]; formula?: string; tap?: string; package?: string; module?: string }>
  links?: { homepage?: string; repository?: string; documentation?: string }
}
interface ClawHubLatestVersion {
  _id: string; version: string; createdAt: number; changelog?: string
  files?: Array<{ path: string; size?: number }>; parsed?: { clawdis?: ClawHubClawdis }
}
interface ClawHubDetailResponse {
  skill: ClawHubSkill; latestVersion: ClawHubLatestVersion | null
  owner?: { handle?: string; displayName?: string; image?: string } | null; resolvedSlug?: string
}

type Tab = 'local' | 'clawhub'
type View = 'list' | 'local-detail' | 'marketplace-detail'
type LocalSort = 'name' | 'source' | 'status'
type MarketplaceSort = 'downloads' | 'stars' | 'newest' | 'updated'
type DisplayMode = 'cards' | 'list'

// ── Convex API ──

const CONVEX_API_URL = 'https://wry-manatee-359.convex.cloud'
const MARKETPLACE_PAGE_SIZE = 25
const LOAD_BATCH = 30

async function convexQuery<T>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${CONVEX_API_URL}/api/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, format: 'json', args }),
  })
  if (!res.ok) { if (res.status === 429) throw new Error('Rate limited'); throw new Error(`Convex error: ${res.status}`) }
  const data = await res.json()
  return data.value ?? data
}

async function convexAction<T>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${CONVEX_API_URL}/api/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, format: 'json', args }),
  })
  if (!res.ok) { if (res.status === 429) throw new Error('Rate limited'); throw new Error(`Convex error: ${res.status}`) }
  const data = await res.json()
  return data.value ?? data
}

// ── Helpers ──

function getSkillAbbr(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function stripFrontmatter(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.startsWith('---')) return content
  const endIndex = normalized.indexOf('\n---', 3)
  if (endIndex === -1) return content
  return normalized.slice(endIndex + 4).replace(/^\n+/, '')
}

function formatOsList(os?: string[]): string[] {
  if (!os?.length) return []
  return os.map(entry => {
    const key = entry.trim().toLowerCase()
    if (key === 'darwin' || key === 'macos' || key === 'mac') return 'macOS'
    if (key === 'linux') return 'Linux'
    if (key === 'windows' || key === 'win32') return 'Windows'
    return entry
  })
}

function formatInstallCmd(spec: { kind: string; formula?: string; tap?: string; package?: string; module?: string }): string | null {
  if (spec.kind === 'brew' && spec.formula) {
    return spec.tap && !spec.formula.includes('/') ? `brew install ${spec.tap}/${spec.formula}` : `brew install ${spec.formula}`
  }
  if (spec.kind === 'node' && spec.package) return `npm i -g ${spec.package}`
  if (spec.kind === 'go' && spec.module) return `go install ${spec.module}`
  if (spec.kind === 'uv' && spec.package) return `uv tool install ${spec.package}`
  return null
}

function installKindLabel(kind: string): string {
  const map: Record<string, string> = { brew: 'Homebrew', node: 'Node', go: 'Go', uv: 'uv' }
  return map[kind] ?? 'Install'
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '\u2014'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`
}

function getStatusInfo(s: SkillStatusEntry): { color: string; label: string; tw: string } {
  if (s.disabled) return { color: 'var(--muted)', label: 'Disabled', tw: 'text-muted-foreground border-border' }
  if (s.blockedByAllowlist) return { color: 'var(--danger)', label: 'Blocked', tw: 'text-destructive border-destructive/30' }
  if (s.eligible) return { color: 'var(--ok)', label: 'Active', tw: 'text-ok border-ok/30' }
  const hasMissing = (s.missing.bins?.length ?? 0) > 0 || (s.missing.env?.length ?? 0) > 0 || (s.missing.config?.length ?? 0) > 0
  if (hasMissing) return { color: 'var(--warn)', label: 'Missing deps', tw: 'text-warn border-warn/30' }
  return { color: 'var(--muted)', label: 'Inactive', tw: 'text-muted-foreground border-border' }
}

function getSourceLabel(source: string): string {
  return source === 'openclaw-bundled' ? 'bundled' : source
}

function normalizeId(value: string | undefined | null): string {
  return (value ?? '').toLowerCase().replace(/\\/g, '/').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function getManagedSkillSlug(skill: SkillStatusEntry): string | null {
  if (skill.bundled || skill.source === 'openclaw-bundled') return null
  const fromPath = (value: string | null | undefined): string | null => {
    const normalized = (value ?? '').replace(/\\/g, '/').trim()
    if (!normalized) return null
    const workspaceMatch = normalized.match(/(?:^|\/)workspace\/skills\/([^/]+)(?:\/|$)/)
    if (workspaceMatch?.[1]) return workspaceMatch[1]
    const skillsMatch = normalized.match(/(?:^|\/)skills\/([^/]+)(?:\/|$)/)
    if (skillsMatch?.[1]) return skillsMatch[1]
    const parts = normalized.split('/').filter(Boolean)
    const last = parts.at(-1) ?? ''
    if (last && last !== 'skills' && !last.includes('.')) return last
    const parent = parts.at(-2) ?? ''
    if (parent && parent !== 'skills') return parent
    return null
  }
  return fromPath(skill.baseDir) ?? fromPath(skill.filePath) ?? fromPath(skill.skillKey)
}

const LOCAL_SORT_OPTIONS: Array<{ value: LocalSort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'source', label: 'Source' },
]

const MARKETPLACE_SORT_OPTIONS: Array<{ value: MarketplaceSort; label: string }> = [
  { value: 'downloads', label: 'Downloads' },
  { value: 'stars', label: 'Stars' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently Updated' },
]

function getMarketplaceBadges(skill: ClawHubSkill): string[] {
  const badges: string[] = []
  if (skill.badges?.highlighted) badges.push('Featured')
  if (skill.badges?.official) badges.push('Official')
  if (skill.badges?.deprecated) badges.push('Deprecated')
  return badges
}


// ── Main Component ──

export function SkillsRoute() {
  // Shared state
  const [tab, setTab] = useState<Tab>('local')
  const [view, setView] = useState<View>('list')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('cards')
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)

  // Local skills state
  const [localSkills, setLocalSkills] = useState<SkillStatusEntry[]>([])
  const [localLoading, setLocalLoading] = useState(true)
  const [localRefreshing, setLocalRefreshing] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [localSort, setLocalSort] = useState<LocalSort>('name')
  const [localVisible, setLocalVisible] = useState(LOAD_BATCH)

  // Local detail state
  const [selectedSkill, setSelectedSkill] = useState<SkillStatusEntry | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [togglingSkill, setTogglingSkill] = useState(false)
  const [uninstallingSkill, setUninstallingSkill] = useState(false)
  const [installingDep, setInstallingDep] = useState<Record<string, boolean>>({})
  const [installResult, setInstallResult] = useState<Record<string, { ok: boolean; message: string }>>({})

  // Marketplace state
  const [mpSkills, setMpSkills] = useState<ClawHubListEntry[]>([])
  const [mpLoading, setMpLoading] = useState(true)
  const [mpError, setMpError] = useState<string | null>(null)
  const [mpCursor, setMpCursor] = useState<string | null>(null)
  const [mpHasMore, setMpHasMore] = useState(false)
  const [mpLoadingMore, setMpLoadingMore] = useState(false)
  const [mpSort, setMpSort] = useState<MarketplaceSort>('downloads')
  const [mpSearchQuery, setMpSearchQuery] = useState('')
  const [mpSearchResults, setMpSearchResults] = useState<ClawHubSearchResult[]>([])
  const [mpSearching, setMpSearching] = useState(false)
  const [mpInstalling, setMpInstalling] = useState<Record<string, boolean>>({})
  const [mpPendingInstall, setMpPendingInstall] = useState<Record<string, boolean>>({})
  const [mpInstallResult, setMpInstallResult] = useState<Record<string, { ok: boolean; message: string }>>({})

  // Marketplace detail state
  const [mpDetail, setMpDetail] = useState<ClawHubDetailResponse | null>(null)
  const [mpDetailLoading, setMpDetailLoading] = useState(false)
  const [mpReadme, setMpReadme] = useState<string | null>(null)
  const [mpReadmeLoading, setMpReadmeLoading] = useState(false)
  const [mpReadmeRaw, setMpReadmeRaw] = useState(false)
  const [mpSelectedFile, setMpSelectedFile] = useState<string | null>(null)
  const [mpFileContent, setMpFileContent] = useState<string | null>(null)
  const [mpFileLoading, setMpFileLoading] = useState(false)
  const [mpFileError, setMpFileError] = useState<string | null>(null)

  const mpLoadedRef = useRef(false)
  const mpSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mpFileCacheRef = useRef(new Map<string, string>())
  const localSkillsRef = useRef(localSkills)
  localSkillsRef.current = localSkills

  // ── Data Loading ──

  const loadLocalSkills = useCallback(async (silent = false) => {
    if (silent && localSkillsRef.current.length > 0) {
      setLocalRefreshing(true)
    } else {
      setLocalLoading(true)
    }
    setLocalError(null)
    try {
      const result = await getGatewayClient().call<SkillStatusReport>('skills.status')
      setLocalSkills(result?.skills ?? [])
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setLocalRefreshing(false)
      setLocalLoading(false)
    }
  }, [])

  const loadMarketplaceSkills = useCallback(async (reset = true) => {
    if (reset) {
      setMpLoading(true)
      setMpError(null)
      setMpSkills([])
      setMpCursor(null)
    }
    try {
      const args: Record<string, unknown> = {
        sort: mpSort === 'newest' ? 'newest' : mpSort,
        dir: 'desc', numItems: MARKETPLACE_PAGE_SIZE,
        highlightedOnly: false, nonSuspiciousOnly: true,
      }
      if (!reset && mpCursor) args.cursor = mpCursor
      const resp = await convexQuery<{ page: ClawHubListEntry[]; hasMore: boolean; nextCursor: string | null }>(
        'skills:listPublicPageV4', args,
      )
      setMpSkills(prev => reset ? resp.page : [...prev, ...resp.page])
      setMpCursor(resp.nextCursor)
      setMpHasMore(resp.hasMore)
    } catch (err) {
      setMpError(err instanceof Error ? err.message : String(err))
    } finally {
      setMpLoading(false)
      setMpLoadingMore(false)
    }
  }, [mpSort, mpCursor])

  useEffect(() => { loadLocalSkills() }, [loadLocalSkills])

  // ── Marketplace search ──

  const searchMarketplace = useCallback(async (query: string) => {
    if (!query.trim()) { setMpSearchResults([]); setMpSearching(false); return }
    setMpSearching(true)
    try {
      const results = await convexAction<ClawHubSearchResult[]>('search:searchSkills', {
        query: query.trim(), limit: 50, highlightedOnly: false, nonSuspiciousOnly: true,
      })
      setMpSearchResults(results ?? [])
    } catch { setMpSearchResults([]) }
    finally { setMpSearching(false) }
  }, [])

  // ── Skill matching ──

  const isMarketplaceSkillInstalled = useCallback((slug: string): boolean => {
    const normalizedSlug = normalizeId(slug)
    if (!normalizedSlug) return false
    return localSkills.some(skill => {
      return [skill.skillKey, skill.name, skill.baseDir, skill.filePath].some(candidate => {
        const normalized = normalizeId(candidate)
        return normalized === normalizedSlug ||
          normalized.endsWith(`-${normalizedSlug}`) ||
          normalized.includes(`skills-${normalizedSlug}`)
      })
    })
  }, [localSkills])

  // ── Actions ──

  async function toggleSkill(skill: SkillStatusEntry) {
    setTogglingSkill(true)
    try {
      await getGatewayClient().call('skills.update', { skillKey: skill.skillKey, enabled: skill.disabled })
      await loadLocalSkills()
      const updated = localSkillsRef.current.find(s => s.skillKey === skill.skillKey)
      if (updated) setSelectedSkill(updated)
    } catch (err) { console.error('toggle skill failed:', err) }
    finally { setTogglingSkill(false) }
  }

  async function saveApiKey(skill: SkillStatusEntry) {
    setSavingApiKey(true)
    try {
      await getGatewayClient().call('skills.update', { skillKey: skill.skillKey, apiKey: apiKeyInput })
      await loadLocalSkills()
      const updated = localSkillsRef.current.find(s => s.skillKey === skill.skillKey)
      if (updated) setSelectedSkill(updated)
    } catch (err) { console.error('save api key failed:', err) }
    finally { setSavingApiKey(false) }
  }

  async function installDep(skill: SkillStatusEntry, option: SkillInstallOption) {
    const key = `${skill.skillKey}:${option.id}`
    setInstallingDep(prev => ({ ...prev, [key]: true }))
    setInstallResult(prev => { const next = { ...prev }; delete next[key]; return next })
    try {
      const result = await getGatewayClient().call<{ ok: boolean; message?: string }>(
        'skills.install', { name: skill.name, installId: option.id, timeoutMs: 120_000 },
      )
      setInstallResult(prev => ({
        ...prev, [key]: { ok: result?.ok !== false, message: result?.ok !== false ? 'Installed' : (result?.message ?? 'Failed') },
      }))
      if (result?.ok !== false) {
        await loadLocalSkills()
        const updated = localSkillsRef.current.find(s => s.skillKey === skill.skillKey)
        if (updated) setSelectedSkill(updated)
      }
    } catch (err) {
      setInstallResult(prev => ({ ...prev, [key]: { ok: false, message: err instanceof Error ? err.message : String(err) } }))
    } finally {
      setInstallingDep(prev => ({ ...prev, [key]: false }))
    }
  }

  async function doUninstallSkill(skill: SkillStatusEntry) {
    const slug = getManagedSkillSlug(skill)
    if (!slug) return
    if (!confirm(`Uninstall ${skill.name}?`)) return
    setUninstallingSkill(true)
    try {
      await window.ocbot!.uninstallSkill(slug)
      await loadLocalSkills()
      if (selectedSkill?.skillKey === skill.skillKey) backToList()
    } catch (err) { setLocalError(err instanceof Error ? err.message : String(err)) }
    finally { setUninstallingSkill(false) }
  }

  async function installMarketplaceSkill(slug: string, version?: string) {
    console.log('[Skills] installMarketplaceSkill:', slug, version)
    setMpInstalling(prev => ({ ...prev, [slug]: true }))
    try {
      const result = await window.ocbot!.installSkill(slug, version)
      console.log('[Skills] install result:', result)
      if (result.ok) {
        setMpInstallResult(prev => ({ ...prev, [slug]: { ok: true, message: 'Installed' } }))
        await loadLocalSkills(true)
      } else {
        setMpInstallResult(prev => ({ ...prev, [slug]: result }))
      }
    } catch (err) {
      console.error('[Skills] install error:', err)
      setMpInstallResult(prev => ({ ...prev, [slug]: { ok: false, message: err instanceof Error ? err.message : String(err) } }))
    } finally {
      setMpInstalling(prev => ({ ...prev, [slug]: false }))
    }
  }

  async function uninstallMarketplaceSkill(slug: string, displayName?: string) {
    const skill = localSkills.find(entry => getManagedSkillSlug(entry) === slug)
    if (skill) { await doUninstallSkill(skill); return }
    if (!confirm(`Uninstall ${displayName || slug}?`)) return
    setUninstallingSkill(true)
    try {
      await window.ocbot!.uninstallSkill(slug)
      await loadLocalSkills(true)
      setMpPendingInstall(prev => { const next = { ...prev }; delete next[slug]; return next })
    } catch (err) { setLocalError(err instanceof Error ? err.message : String(err)) }
    finally { setUninstallingSkill(false) }
  }

  // ── Marketplace detail ──

  async function loadMarketplaceDetail(slug: string) {
    setMpDetailLoading(true)
    setMpDetail(null)
    setMpReadme(null)
    setMpReadmeRaw(false)
    setMpSelectedFile(null)
    setMpFileContent(null)
    setMpFileError(null)
    mpFileCacheRef.current.clear()
    setView('marketplace-detail')
    try {
      const detail = await convexQuery<ClawHubDetailResponse>('skills:getBySlug', { slug })
      setMpDetail(detail)
      if (detail?.latestVersion?._id) {
        setMpReadmeLoading(true)
        convexAction<{ text: string }>('skills:getReadme', { versionId: detail.latestVersion._id })
          .then(data => setMpReadme(stripFrontmatter(data.text)))
          .catch(() => setMpReadme(null))
          .finally(() => setMpReadmeLoading(false))
      }
    } catch (err) {
      setMpError(err instanceof Error ? err.message : String(err))
      setView('list')
    } finally { setMpDetailLoading(false) }
  }

  async function selectFile(filePath: string) {
    const versionId = mpDetail?.latestVersion?._id
    if (!versionId) return
    setMpSelectedFile(filePath)
    setMpFileError(null)
    const cacheKey = `${versionId}:${filePath}`
    const cached = mpFileCacheRef.current.get(cacheKey)
    if (cached !== undefined) { setMpFileContent(cached); return }
    setMpFileContent(null)
    setMpFileLoading(true)
    try {
      const data = await convexAction<{ text: string }>('skills:getFileText', { versionId, path: filePath })
      mpFileCacheRef.current.set(cacheKey, data.text)
      setMpFileContent(data.text)
    } catch (err) { setMpFileError(err instanceof Error ? err.message : String(err)) }
    finally { setMpFileLoading(false) }
  }

  // ── Navigation ──

  function openLocalDetail(skill: SkillStatusEntry) {
    setSelectedSkill(skill)
    setApiKeyInput('')
    setApiKeyVisible(false)
    setInstallResult({})
    setView('local-detail')
  }

  function backToList() {
    setView('list')
    setSelectedSkill(null)
    setMpDetail(null)
  }

  function switchTab(newTab: Tab) {
    setTab(newTab)
    setView('list')
    setLocalVisible(LOAD_BATCH)
    setSelectedSkill(null)
    setMpDetail(null)
    setSortDropdownOpen(false)
    if (newTab === 'clawhub' && !mpLoadedRef.current) {
      mpLoadedRef.current = true
      loadMarketplaceSkills()
    }
  }

  function onMpSortChange(sort: MarketplaceSort) {
    setMpSort(sort)
    setSortDropdownOpen(false)
    setMpSearchQuery('')
    setMpSearchResults([])
    // Trigger reload with new sort
    setMpLoading(true)
    setMpSkills([])
    setMpCursor(null)
    convexQuery<{ page: ClawHubListEntry[]; hasMore: boolean; nextCursor: string | null }>(
      'skills:listPublicPageV4',
      { sort, dir: 'desc', numItems: MARKETPLACE_PAGE_SIZE, highlightedOnly: false, nonSuspiciousOnly: true },
    ).then(resp => {
      setMpSkills(resp.page)
      setMpCursor(resp.nextCursor)
      setMpHasMore(resp.hasMore)
    }).catch(err => setMpError(err instanceof Error ? err.message : String(err)))
      .finally(() => setMpLoading(false))
  }

  function loadMoreMarketplace() {
    if (mpLoadingMore || !mpHasMore || !mpCursor) return
    setMpLoadingMore(true)
    convexQuery<{ page: ClawHubListEntry[]; hasMore: boolean; nextCursor: string | null }>(
      'skills:listPublicPageV4',
      { sort: mpSort, dir: 'desc', numItems: MARKETPLACE_PAGE_SIZE, cursor: mpCursor, highlightedOnly: false, nonSuspiciousOnly: true },
    ).then(resp => {
      setMpSkills(prev => [...prev, ...resp.page])
      setMpCursor(resp.nextCursor)
      setMpHasMore(resp.hasMore)
    }).catch(err => setMpError(err instanceof Error ? err.message : String(err)))
      .finally(() => setMpLoadingMore(false))
  }

  // ── Filtering / Sorting ──

  function getFilteredLocalSkills(): SkillStatusEntry[] {
    const q = searchQuery.toLowerCase().trim()
    let skills = q
      ? localSkills.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.skillKey.toLowerCase().includes(q))
      : [...localSkills]
    switch (localSort) {
      case 'name': skills.sort((a, b) => a.name.localeCompare(b.name)); break
      case 'source': skills.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name)); break
      case 'status': skills.sort((a, b) => {
        const rank = (s: SkillStatusEntry) => s.eligible ? 0 : s.disabled ? 2 : 1
        return rank(a) - rank(b) || a.name.localeCompare(b.name)
      }); break
    }
    return skills
  }

  function handleSearchInput(value: string) {
    if (tab === 'local') {
      setSearchQuery(value)
      setLocalVisible(LOAD_BATCH)
    } else {
      setMpSearchQuery(value)
      if (mpSearchTimerRef.current) clearTimeout(mpSearchTimerRef.current)
      mpSearchTimerRef.current = setTimeout(() => searchMarketplace(value), 300)
    }
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      if (tab === 'local') {
        const total = getFilteredLocalSkills().length
        if (localVisible < total) setLocalVisible(prev => prev + LOAD_BATCH)
      } else if (!mpSearchQuery.trim()) {
        loadMoreMarketplace()
      }
    }
  }


  // ── Render: Router ──

  if (view === 'local-detail' && selectedSkill) return <LocalDetailView
    skill={selectedSkill} onBack={backToList} onToggle={toggleSkill} togglingSkill={togglingSkill}
    onUninstall={doUninstallSkill} uninstallingSkill={uninstallingSkill}
    apiKeyInput={apiKeyInput} setApiKeyInput={setApiKeyInput} apiKeyVisible={apiKeyVisible} setApiKeyVisible={setApiKeyVisible}
    savingApiKey={savingApiKey} onSaveApiKey={saveApiKey}
    installingDep={installingDep} installResult={installResult} onInstallDep={installDep}
  />

  if (view === 'marketplace-detail') return <MarketplaceDetailView
    detail={mpDetail} loading={mpDetailLoading} onBack={backToList}
    readme={mpReadme} readmeLoading={mpReadmeLoading} readmeRaw={mpReadmeRaw} setReadmeRaw={setMpReadmeRaw}
    selectedFile={mpSelectedFile} fileContent={mpFileContent} fileLoading={mpFileLoading} fileError={mpFileError}
    onSelectFile={selectFile}
    installing={mpInstalling} pendingInstall={mpPendingInstall} installResult={mpInstallResult}
    uninstallingSkill={uninstallingSkill}
    isInstalled={isMarketplaceSkillInstalled}
    onInstall={installMarketplaceSkill} onUninstall={uninstallMarketplaceSkill}
  />

  // ── Render: List Page ──

  const filteredLocal = getFilteredLocalSkills()
  const visibleLocal = filteredLocal.slice(0, localVisible)
  const showToolbar = tab === 'local' ? localSkills.length > 0 : (!mpLoading || mpSkills.length > 0)
  const sortOptions = tab === 'local' ? LOCAL_SORT_OPTIONS : MARKETPLACE_SORT_OPTIONS
  const currentSort = tab === 'local' ? localSort : mpSort
  const currentSortLabel = sortOptions.find(o => o.value === currentSort)?.label ?? 'Sort'

  return (
    <div className="relative flex-1">
      <div className="absolute inset-0 overflow-y-auto p-6" onScroll={handleScroll}>
      {/* Header */}
      <h1 className="text-[22px] font-semibold tracking-tight text-text-strong">Skills</h1>
      <p className="mt-1 text-sm text-muted-foreground">Browse and manage your AI skills</p>

      {/* Tabs */}
      <div className="mt-4 flex gap-4 border-b border-border">
        <button
          className={cn('pb-2 text-sm border-b-2 transition-colors', tab === 'local' ? 'border-accent font-semibold text-text-strong' : 'border-transparent text-muted-foreground hover:text-text')}
          onClick={() => switchTab('local')}
        >My Skills ({localSkills.length})</button>
        <button
          className={cn('pb-2 text-sm border-b-2 transition-colors', tab === 'clawhub' ? 'border-accent font-semibold text-text-strong' : 'border-transparent text-muted-foreground hover:text-text')}
          onClick={() => switchTab('clawhub')}
        >Marketplace</button>
      </div>

      {/* Toolbar */}
      {showToolbar && (
        <div className="mt-4 flex items-center gap-2.5">
          <div className="relative max-w-[400px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder={tab === 'local' ? 'Search skills...' : 'Search marketplace...'}
              value={tab === 'local' ? searchQuery : mpSearchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg py-2 pl-9 pr-3 text-sm text-text-strong outline-none transition-colors focus:border-accent"
            />
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-bg-hover transition-colors"
              onClick={e => { e.stopPropagation(); setSortDropdownOpen(!sortDropdownOpen) }}
            >
              {currentSortLabel}
              <ChevronDown className="h-3 w-3" />
            </button>
            {sortDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[99]" onClick={() => setSortDropdownOpen(false)} />
                <div className="absolute right-0 top-full z-[100] mt-1 min-w-[160px] rounded-lg border border-border bg-bg-subtle py-1 shadow-lg">
                  {sortOptions.map(opt => (
                    <button
                      key={opt.value}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                        opt.value === currentSort ? 'bg-accent/10 text-accent' : 'text-text-strong hover:bg-bg-hover',
                      )}
                      onClick={() => {
                        if (tab === 'local') { setLocalSort(opt.value as LocalSort); setSortDropdownOpen(false); setLocalVisible(LOAD_BATCH) }
                        else onMpSortChange(opt.value as MarketplaceSort)
                      }}
                    >
                      {opt.value === currentSort ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Refresh (local only) */}
          {tab === 'local' && (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-bg-hover transition-colors disabled:opacity-50"
              disabled={localRefreshing}
              onClick={() => loadLocalSkills(true)}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', localRefreshing && 'animate-spin')} />
              {localRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}

          {/* Display mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              className={cn('p-1.5 transition-colors', displayMode === 'cards' ? 'bg-accent/10 text-accent' : 'text-muted-foreground')}
              onClick={() => setDisplayMode('cards')} title="Cards"
            ><LayoutGrid className="h-4 w-4" /></button>
            <button
              className={cn('p-1.5 border-l border-border transition-colors', displayMode === 'list' ? 'bg-accent/10 text-accent' : 'text-muted-foreground')}
              onClick={() => setDisplayMode('list')} title="List"
            ><List className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="mt-3">
        {tab === 'local' ? (
          localLoading ? <EmptyState message="Loading..." /> :
          localError ? <div className="py-12 text-center text-sm text-destructive">{localError}</div> :
          filteredLocal.length === 0 ? (
            searchQuery ? <EmptyState message="No matching skills" /> :
            <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
              <span>No skills installed</span>
              <button className="rounded-lg border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors" onClick={() => switchTab('clawhub')}>Browse Marketplace</button>
            </div>
          ) : (
            <>
              {displayMode === 'cards' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                  {visibleLocal.map(s => <LocalCard key={s.skillKey} skill={s} onClick={() => openLocalDetail(s)} onUninstall={doUninstallSkill} uninstallingSkill={uninstallingSkill} />)}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {visibleLocal.map(s => <LocalListRow key={s.skillKey} skill={s} onClick={() => openLocalDetail(s)} onUninstall={doUninstallSkill} uninstallingSkill={uninstallingSkill} />)}
                </div>
              )}
              {visibleLocal.length < filteredLocal.length && <div className="py-4 text-center text-xs text-muted-foreground">Loading more...</div>}
            </>
          )
        ) : (
          mpLoading && mpSkills.length === 0 ? <EmptyState message="Loading marketplace..." /> :
          mpError && mpSkills.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-sm">
              <span className="text-destructive">{mpError}</span>
              <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-bg-hover" onClick={() => loadMarketplaceSkills()}>Retry</button>
            </div>
          ) : mpSearchQuery.trim() ? (
            mpSearching ? <EmptyState message="Searching..." /> :
            mpSearchResults.length === 0 ? <EmptyState message="No results found" /> :
            displayMode === 'cards' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {mpSearchResults.map(r => <SearchResultCard key={r.skill?._id ?? r.slug} result={r} isInstalled={isMarketplaceSkillInstalled} installing={mpInstalling} pendingInstall={mpPendingInstall} installResult={mpInstallResult} uninstallingSkill={uninstallingSkill} onDetail={loadMarketplaceDetail} onInstall={installMarketplaceSkill} onUninstall={uninstallMarketplaceSkill} />)}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {mpSearchResults.map(r => <SearchResultListRow key={r.skill?._id ?? r.slug} result={r} isInstalled={isMarketplaceSkillInstalled} installing={mpInstalling} pendingInstall={mpPendingInstall} uninstallingSkill={uninstallingSkill} onDetail={loadMarketplaceDetail} onInstall={installMarketplaceSkill} onUninstall={uninstallMarketplaceSkill} />)}
              </div>
            )
          ) : mpSkills.length === 0 ? <EmptyState message="No skills available" /> : (
            <>
              {displayMode === 'cards' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                  {mpSkills.map(entry => <MarketplaceCard key={entry.skill._id} entry={entry} isInstalled={isMarketplaceSkillInstalled} installing={mpInstalling} pendingInstall={mpPendingInstall} installResult={mpInstallResult} uninstallingSkill={uninstallingSkill} onDetail={loadMarketplaceDetail} onInstall={installMarketplaceSkill} onUninstall={uninstallMarketplaceSkill} />)}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {mpSkills.map(entry => <MarketplaceListRow key={entry.skill._id} entry={entry} isInstalled={isMarketplaceSkillInstalled} installing={mpInstalling} pendingInstall={mpPendingInstall} uninstallingSkill={uninstallingSkill} onDetail={loadMarketplaceDetail} onInstall={installMarketplaceSkill} onUninstall={uninstallMarketplaceSkill} />)}
                </div>
              )}
              {mpLoadingMore ? <div className="py-4 text-center text-xs text-muted-foreground">Loading more...</div> :
               mpHasMore ? <div className="py-4 text-center"><button className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground hover:bg-bg-hover" onClick={loadMoreMarketplace}>Load more</button></div> : null}
            </>
          )
        )}
      </div>
    </div>
    </div>
  )
}


// ── Sub-components ──

function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{message}</div>
}

function SkillAvatar({ emoji, name, size = 'md' }: { emoji?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-16 w-16 rounded-2xl text-xl font-bold' : size === 'sm' ? 'h-9 w-9 rounded-md text-xs font-semibold' : 'h-12 w-12 rounded-lg text-sm font-semibold'
  return <div className={cn('flex items-center justify-center shrink-0 bg-accent/10 text-accent', cls)}>{emoji || getSkillAbbr(name)}</div>
}

function StatusBadge({ skill }: { skill: SkillStatusEntry }) {
  const status = getStatusInfo(skill)
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium', status.tw)}>{status.label}</span>
}

// ── Local Card ──

function LocalCard({ skill, onClick, onUninstall, uninstallingSkill }: {
  skill: SkillStatusEntry; onClick: () => void; onUninstall: (s: SkillStatusEntry) => void; uninstallingSkill: boolean
}) {
  const canUninstall = getManagedSkillSlug(skill) !== null
  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-bg-subtle p-5 cursor-pointer transition-all hover:shadow-md hover:border-border-strong"
      onClick={onClick}
    >
      <div className="flex items-start gap-3.5">
        <SkillAvatar emoji={skill.emoji} name={skill.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold tracking-tight text-text-strong">{skill.name}</span>
            <StatusBadge skill={skill} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{getSourceLabel(skill.source)}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground line-clamp-2 flex-1">{skill.description || 'No description'}</p>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-mono">{skill.skillKey}</span>
        <div className="flex items-center gap-2">
          {canUninstall && (
            <button
              className="rounded-md border border-destructive/30 px-3 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              disabled={uninstallingSkill}
              onClick={e => { e.stopPropagation(); onUninstall(skill) }}
            >{uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
          )}
          {skill.homepage && <ExternalLink className="h-3.5 w-3.5" />}
        </div>
      </div>
    </div>
  )
}

// ── Local List Row ──

function LocalListRow({ skill, onClick, onUninstall, uninstallingSkill }: {
  skill: SkillStatusEntry; onClick: () => void; onUninstall: (s: SkillStatusEntry) => void; uninstallingSkill: boolean
}) {
  const canUninstall = getManagedSkillSlug(skill) !== null
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border bg-bg-subtle px-4 py-3 cursor-pointer transition-all hover:bg-bg-hover"
      onClick={onClick}
    >
      <SkillAvatar emoji={skill.emoji} name={skill.name} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text-strong">{skill.name}</span>
          <StatusBadge skill={skill} />
        </div>
        {skill.description && <div className="mt-0.5 truncate text-xs text-muted-foreground">{skill.description}</div>}
      </div>
      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{getSourceLabel(skill.source)}</span>
      {canUninstall && (
        <button
          className="shrink-0 rounded-md border border-destructive/30 px-3 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          disabled={uninstallingSkill}
          onClick={e => { e.stopPropagation(); onUninstall(skill) }}
        >{uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
      )}
    </div>
  )
}

// ── Marketplace Card ──

function MarketplaceCard({ entry, isInstalled, installing, pendingInstall, installResult, uninstallingSkill, onDetail, onInstall, onUninstall }: {
  entry: ClawHubListEntry; isInstalled: (slug: string) => boolean
  installing: Record<string, boolean>; pendingInstall: Record<string, boolean>; installResult: Record<string, { ok: boolean; message: string }>
  uninstallingSkill: boolean; onDetail: (slug: string) => void; onInstall: (slug: string, version?: string) => void; onUninstall: (slug: string, name?: string) => void
}) {
  const { skill, owner, latestVersion } = entry
  const badges = getMarketplaceBadges(skill)
  const isInst = isInstalled(skill.slug) || installResult[skill.slug]?.ok === true
  const isInstalling = installing[skill.slug] || pendingInstall[skill.slug]

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-bg-subtle p-5 cursor-pointer transition-all hover:shadow-md hover:border-border-strong"
      onClick={() => onDetail(skill.slug)}
    >
      <div className="flex items-start gap-3.5">
        <SkillAvatar name={skill.displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="truncate text-[15px] font-semibold tracking-tight text-text-strong">{skill.displayName}</span>
            {badges.map(b => <span key={b} className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">{b}</span>)}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {owner?.handle && <span className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground">@{owner.handle || owner.displayName}</span>}
            {latestVersion && <span className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground">v{latestVersion.version}</span>}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground line-clamp-2 flex-1">{skill.summary || 'No description'}</p>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <div className="flex gap-3">
          <span title="Downloads"><Download className="inline h-3 w-3 mr-0.5" />{formatNumber(skill.stats.downloads)}</span>
          <span title="Stars"><Star className="inline h-3 w-3 mr-0.5" />{formatNumber(skill.stats.stars)}</span>
        </div>
        <div className="flex items-center gap-2">
          {isInst ? (
            <>
              <span className="text-[11px] text-ok">✓ Installed</span>
              <button className="rounded-md border border-destructive/30 px-3 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50" disabled={uninstallingSkill} onClick={e => { e.stopPropagation(); onUninstall(skill.slug, skill.displayName) }}>{uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
            </>
          ) : (
            <button className="rounded-md border border-accent bg-accent/10 px-3 py-0.5 text-[11px] text-accent hover:bg-accent/20 disabled:opacity-50" disabled={isInstalling} onClick={e => { e.stopPropagation(); onInstall(skill.slug, latestVersion?.version) }}>{isInstalling ? 'Installing...' : 'Install'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Marketplace List Row ──

function MarketplaceListRow({ entry, isInstalled, installing, pendingInstall, uninstallingSkill, onDetail, onInstall, onUninstall }: {
  entry: ClawHubListEntry; isInstalled: (slug: string) => boolean
  installing: Record<string, boolean>; pendingInstall: Record<string, boolean>
  uninstallingSkill: boolean; onDetail: (slug: string) => void; onInstall: (slug: string, version?: string) => void; onUninstall: (slug: string, name?: string) => void
}) {
  const { skill, owner, latestVersion } = entry
  const isInst = isInstalled(skill.slug)
  const isInstalling = installing[skill.slug] || pendingInstall[skill.slug]

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-subtle px-4 py-3 cursor-pointer transition-all hover:bg-bg-hover" onClick={() => onDetail(skill.slug)}>
      <SkillAvatar name={skill.displayName} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-text-strong">{skill.displayName}</span>
          <span className="text-[11px] text-muted-foreground"><Download className="inline h-3 w-3 mr-0.5" />{formatNumber(skill.stats.downloads)}</span>
          <span className="text-[11px] text-muted-foreground"><Star className="inline h-3 w-3 mr-0.5" />{formatNumber(skill.stats.stars)}</span>
        </div>
        {skill.summary && <div className="mt-0.5 truncate text-xs text-muted-foreground">{skill.summary}</div>}
      </div>
      {owner?.handle && <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">@{owner.handle || owner.displayName}</span>}
      {isInst ? (
        <>
          <span className="shrink-0 text-[11px] text-ok">✓</span>
          <button className="shrink-0 rounded-md border border-destructive/30 px-3 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50" disabled={uninstallingSkill} onClick={e => { e.stopPropagation(); onUninstall(skill.slug, skill.displayName) }}>{uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
        </>
      ) : (
        <button className="shrink-0 rounded-md border border-accent bg-accent/10 px-3 py-0.5 text-[11px] text-accent hover:bg-accent/20 disabled:opacity-50" disabled={isInstalling} onClick={e => { e.stopPropagation(); onInstall(skill.slug, latestVersion?.version) }}>{isInstalling ? 'Installing...' : 'Install'}</button>
      )}
    </div>
  )
}

// ── Search Result Card ──

function SearchResultCard({ result, isInstalled, installing, pendingInstall, installResult, uninstallingSkill, onDetail, onInstall, onUninstall }: {
  result: ClawHubSearchResult; isInstalled: (slug: string) => boolean
  installing: Record<string, boolean>; pendingInstall: Record<string, boolean>; installResult: Record<string, { ok: boolean; message: string }>
  uninstallingSkill: boolean; onDetail: (slug: string) => void; onInstall: (slug: string, version?: string) => void; onUninstall: (slug: string, name?: string) => void
}) {
  const name = result.skill?.displayName ?? result.displayName ?? result.slug ?? '?'
  const slug = result.skill?.slug ?? result.slug ?? ''
  const summary = result.skill?.summary ?? result.summary ?? null
  const version = result.version?.version
  const isInst = isInstalled(slug) || installResult[slug]?.ok === true
  const isInstalling = installing[slug] || pendingInstall[slug]

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-bg-subtle p-5 cursor-pointer transition-all hover:shadow-md hover:border-border-strong" onClick={() => slug && onDetail(slug)}>
      <div className="flex items-start gap-3.5">
        <SkillAvatar name={name} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold tracking-tight text-text-strong">{name}</span>
          {version && <div className="mt-1.5"><span className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground">v{version}</span></div>}
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground line-clamp-2 flex-1">{summary || 'No description'}</p>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-mono">{slug}</span>
        {isInst ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ok">✓ Installed</span>
            <button className="rounded-md border border-destructive/30 px-3 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50" disabled={uninstallingSkill} onClick={e => { e.stopPropagation(); slug && onUninstall(slug, name) }}>{uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
          </div>
        ) : (
          <button className="rounded-md border border-accent bg-accent/10 px-3 py-0.5 text-[11px] text-accent hover:bg-accent/20 disabled:opacity-50" disabled={isInstalling} onClick={e => { e.stopPropagation(); slug && onInstall(slug, version) }}>{isInstalling ? 'Installing...' : 'Install'}</button>
        )}
      </div>
    </div>
  )
}

// ── Search Result List Row ──

function SearchResultListRow({ result, isInstalled, installing, pendingInstall, uninstallingSkill, onDetail, onInstall, onUninstall }: {
  result: ClawHubSearchResult; isInstalled: (slug: string) => boolean
  installing: Record<string, boolean>; pendingInstall: Record<string, boolean>
  uninstallingSkill: boolean; onDetail: (slug: string) => void; onInstall: (slug: string, version?: string) => void; onUninstall: (slug: string, name?: string) => void
}) {
  const name = result.skill?.displayName ?? result.displayName ?? result.slug ?? '?'
  const slug = result.skill?.slug ?? result.slug ?? ''
  const summary = result.skill?.summary ?? result.summary ?? null
  const isInst = isInstalled(slug)
  const isInstalling = installing[slug] || pendingInstall[slug]

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-subtle px-4 py-3 cursor-pointer transition-all hover:bg-bg-hover" onClick={() => slug && onDetail(slug)}>
      <SkillAvatar name={name} size="sm" />
      <div className="flex-1 min-w-0">
        <span className="truncate text-sm font-medium text-text-strong">{name}</span>
        {summary && <div className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</div>}
      </div>
      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{slug}</span>
      {isInst ? (
        <>
          <span className="shrink-0 text-[11px] text-ok">✓</span>
          <button className="shrink-0 rounded-md border border-destructive/30 px-3 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50" disabled={uninstallingSkill} onClick={e => { e.stopPropagation(); slug && onUninstall(slug, name) }}>{uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
        </>
      ) : (
        <button className="shrink-0 rounded-md border border-accent bg-accent/10 px-3 py-0.5 text-[11px] text-accent hover:bg-accent/20 disabled:opacity-50" disabled={isInstalling} onClick={e => { e.stopPropagation(); slug && onInstall(slug) }}>{isInstalling ? 'Installing...' : 'Install'}</button>
      )}
    </div>
  )
}


// ── Local Detail View ──

function LocalDetailView({ skill, onBack, onToggle, togglingSkill, onUninstall, uninstallingSkill,
  apiKeyInput, setApiKeyInput, apiKeyVisible, setApiKeyVisible, savingApiKey, onSaveApiKey,
  installingDep, installResult, onInstallDep,
}: {
  skill: SkillStatusEntry; onBack: () => void
  onToggle: (s: SkillStatusEntry) => void; togglingSkill: boolean
  onUninstall: (s: SkillStatusEntry) => void; uninstallingSkill: boolean
  apiKeyInput: string; setApiKeyInput: (v: string) => void; apiKeyVisible: boolean; setApiKeyVisible: (v: boolean) => void
  savingApiKey: boolean; onSaveApiKey: (s: SkillStatusEntry) => void
  installingDep: Record<string, boolean>; installResult: Record<string, { ok: boolean; message: string }>
  onInstallDep: (s: SkillStatusEntry, opt: SkillInstallOption) => void
}) {
  const status = getStatusInfo(skill)
  const allBins = skill.requirements.bins ?? []
  const allEnv = skill.requirements.env ?? []
  const allConfig = skill.requirements.config ?? []
  const missingBins = new Set(skill.missing.bins ?? [])
  const missingEnv = new Set(skill.missing.env ?? [])
  const missingConfig = new Set(skill.missing.config ?? [])
  const hasRequirements = allBins.length > 0 || allEnv.length > 0 || allConfig.length > 0
  const canUninstall = getManagedSkillSlug(skill) !== null

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <button className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-text-strong transition-colors" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to My Skills
      </button>

      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-start gap-5">
          <SkillAvatar emoji={skill.emoji} name={skill.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-semibold tracking-tight text-text-strong">{skill.name}</h1>
              <StatusBadge skill={skill} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <span>source: <span className="font-medium text-text-strong">{getSourceLabel(skill.source)}</span></span>
              <span className="text-border">·</span>
              <span className="font-mono">{skill.skillKey}</span>
            </div>
            {skill.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{skill.description}</p>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className={cn('rounded-lg px-5 py-2 text-sm font-medium transition-colors', skill.disabled ? 'border border-border text-muted-foreground hover:bg-bg-hover' : 'bg-accent text-white hover:bg-accent/90')}
            disabled={togglingSkill} onClick={() => onToggle(skill)}
          >{togglingSkill ? '...' : skill.disabled ? 'Enable Skill' : 'Disable Skill'}</button>
          {canUninstall && (
            <button className="rounded-lg border border-destructive/30 px-5 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50" disabled={uninstallingSkill} onClick={() => onUninstall(skill)}>
              {uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}
            </button>
          )}
          {skill.homepage && (
            <a href={skill.homepage} target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-lg border border-border px-5 py-2 text-sm text-muted-foreground hover:bg-bg-hover transition-colors no-underline">
              Homepage <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {/* Requirements */}
        {hasRequirements && (
          <section>
            <h2 className="text-base font-semibold text-text-strong mb-3">Requirements</h2>
            <div className="flex flex-col gap-1.5 text-[13px]">
              {allBins.map(b => (
                <div key={b} className="flex items-center gap-2">
                  <span className={cn('w-4 text-center font-semibold', missingBins.has(b) ? 'text-destructive' : 'text-ok')}>{missingBins.has(b) ? '✗' : '✓'}</span>
                  <span className="text-muted-foreground">bin:</span>
                  <span className="font-mono text-text-strong">{b}</span>
                </div>
              ))}
              {allEnv.map(e => (
                <div key={e} className="flex items-center gap-2">
                  <span className={cn('w-4 text-center font-semibold', missingEnv.has(e) ? 'text-destructive' : 'text-ok')}>{missingEnv.has(e) ? '✗' : '✓'}</span>
                  <span className="text-muted-foreground">env:</span>
                  <span className="font-mono text-text-strong">{e}</span>
                </div>
              ))}
              {allConfig.map(c => (
                <div key={c} className="flex items-center gap-2">
                  <span className={cn('w-4 text-center font-semibold', missingConfig.has(c) ? 'text-destructive' : 'text-ok')}>{missingConfig.has(c) ? '✗' : '✓'}</span>
                  <span className="text-muted-foreground">config:</span>
                  <span className="font-mono text-text-strong">{c}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Install Dependencies */}
        {skill.install.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-text-strong mb-3">Install Dependencies</h2>
            <div className="flex flex-col gap-2">
              {skill.install.map(opt => {
                const key = `${skill.skillKey}:${opt.id}`
                const isInstalling = installingDep[key]
                const result = installResult[key]
                return (
                  <div key={opt.id} className="flex items-center gap-2.5">
                    <button
                      className="rounded-lg border border-border px-4 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-bg-hover transition-colors disabled:opacity-50"
                      disabled={isInstalling} onClick={() => onInstallDep(skill, opt)}
                    >{isInstalling ? 'Installing...' : opt.label}</button>
                    {result && <span className={cn('text-xs', result.ok ? 'text-ok' : 'text-destructive')}>{result.message}</span>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* API Key Configuration */}
        {skill.primaryEnv && (
          <section>
            <h2 className="text-base font-semibold text-text-strong mb-3">Configuration</h2>
            <div className="rounded-lg border border-border bg-bg p-4">
              <label className="mb-2 block text-[13px] font-medium text-text-strong">{skill.primaryEnv}</label>
              <div className="flex items-center gap-2">
                <input
                  type={apiKeyVisible ? 'text' : 'password'}
                  placeholder="Enter API key..."
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-text-strong outline-none focus:border-accent"
                />
                <button className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-bg-hover transition-colors" onClick={() => setApiKeyVisible(!apiKeyVisible)}>
                  {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50" disabled={savingApiKey} onClick={() => onSaveApiKey(skill)}>
                  {savingApiKey ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Config Checks */}
        {skill.configChecks.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-text-strong mb-3">Config Checks</h2>
            <div className="flex flex-col gap-1 text-[13px]">
              {skill.configChecks.map(c => (
                <div key={c.path} className="flex items-center gap-2">
                  <span className={cn('w-4 text-center font-semibold', c.satisfied ? 'text-ok' : 'text-destructive')}>{c.satisfied ? '✓' : '✗'}</span>
                  <span className="font-mono text-text-strong">{c.path}</span>
                  {c.note && <span className="text-muted-foreground">— {c.note}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}


// ── Marketplace Detail View ──

function MarketplaceDetailView({ detail, loading, onBack, readme, readmeLoading, readmeRaw, setReadmeRaw,
  selectedFile, fileContent, fileLoading, fileError, onSelectFile,
  installing, pendingInstall, installResult, uninstallingSkill, isInstalled, onInstall, onUninstall,
}: {
  detail: ClawHubDetailResponse | null; loading: boolean; onBack: () => void
  readme: string | null; readmeLoading: boolean; readmeRaw: boolean; setReadmeRaw: (v: boolean) => void
  selectedFile: string | null; fileContent: string | null; fileLoading: boolean; fileError: string | null
  onSelectFile: (path: string) => void
  installing: Record<string, boolean>; pendingInstall: Record<string, boolean>; installResult: Record<string, { ok: boolean; message: string }>
  uninstallingSkill: boolean; isInstalled: (slug: string) => boolean
  onInstall: (slug: string, version?: string) => void; onUninstall: (slug: string, name?: string) => void
}) {
  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <button className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-text-strong transition-colors" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to Marketplace
        </button>
        <EmptyState message="Loading skill details..." />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-1 flex-col">
        <button className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-text-strong transition-colors" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to Marketplace
        </button>
        <EmptyState message="Skill not found" />
      </div>
    )
  }

  const { skill, latestVersion, owner } = detail
  const badges = getMarketplaceBadges(skill)
  const isInst = isInstalled(skill.slug) || installResult[skill.slug]?.ok === true
  const isInstalling = installing[skill.slug] || pendingInstall[skill.slug]
  const result = installResult[skill.slug]
  const clawdis = latestVersion?.parsed?.clawdis
  const requires = clawdis?.requires
  const osLabels = formatOsList(clawdis?.os)
  const installSpecs = clawdis?.install ?? []
  const envVars = clawdis?.envVars ?? []
  const deps = clawdis?.dependencies ?? []
  const links = clawdis?.links
  const hasRequirements = Boolean(
    requires?.bins?.length || requires?.anyBins?.length || requires?.env?.length ||
    requires?.config?.length || clawdis?.primaryEnv || envVars.length || osLabels.length
  )

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <button className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-text-strong transition-colors" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to Marketplace
      </button>

      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-start gap-5">
          <SkillAvatar emoji={clawdis?.emoji} name={skill.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-semibold tracking-tight text-text-strong">{skill.displayName}</h1>
              {badges.map(b => <span key={b} className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">{b}</span>)}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              {owner?.handle && (<><span>by <span className="font-medium text-text-strong">@{owner.handle || owner.displayName}</span></span><span className="text-border">·</span></>)}
              <span className="font-mono">{skill.slug}</span>
              {latestVersion && (<><span className="text-border">·</span><span>v{latestVersion.version}</span></>)}
              {osLabels.length > 0 && (<><span className="text-border">·</span><span>{osLabels.join(' / ')}</span></>)}
            </div>
            {skill.summary && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{skill.summary}</p>}
            <div className="mt-2.5 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
              <span><Download className="inline h-3.5 w-3.5 mr-1" />{formatNumber(skill.stats.downloads)} downloads</span>
              <span><Star className="inline h-3.5 w-3.5 mr-1" />{formatNumber(skill.stats.stars)} stars</span>
              {skill.stats.installsCurrent != null && <span>⊚ {formatNumber(skill.stats.installsCurrent)} active installs</span>}
              <span>{skill.stats.versions} versions</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {isInst ? (
            <>
              <button className="rounded-lg border border-ok px-5 py-2 text-sm font-medium text-ok" disabled>✓ Installed</button>
              <button className="rounded-lg border border-destructive/30 px-5 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50" disabled={uninstallingSkill} onClick={() => onUninstall(skill.slug, skill.displayName)}>
                {uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}
              </button>
            </>
          ) : (
            <button className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50" disabled={isInstalling} onClick={() => onInstall(skill.slug, latestVersion?.version)}>
              {isInstalling ? 'Installing...' : 'Install Skill'}
            </button>
          )}
          {result && !result.ok && !isInstalling && <span className="text-[13px] text-destructive">{result.message}</span>}
        </div>

        {/* Info panels grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {/* Runtime requirements */}
          {hasRequirements && (
            <section className="rounded-lg border border-border bg-bg-subtle p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-strong">Runtime Requirements</h3>
              <div className="flex flex-col gap-2 text-[13px]">
                {osLabels.length > 0 && <div className="flex gap-2"><span className="min-w-[60px] text-muted-foreground">OS</span><span className="text-text-strong">{osLabels.join(' · ')}</span></div>}
                {requires?.bins?.length ? <div className="flex gap-2"><span className="min-w-[60px] text-muted-foreground">Bins</span><span className="font-mono text-text-strong">{requires.bins.join(', ')}</span></div> : null}
                {requires?.anyBins?.length ? <div className="flex gap-2"><span className="min-w-[60px] text-muted-foreground">Any bin</span><span className="font-mono text-text-strong">{requires.anyBins.join(', ')}</span></div> : null}
                {requires?.env?.length ? <div className="flex gap-2"><span className="min-w-[60px] text-muted-foreground">Env</span><span className="font-mono text-text-strong">{requires.env.join(', ')}</span></div> : null}
                {requires?.config?.length ? <div className="flex gap-2"><span className="min-w-[60px] text-muted-foreground">Config</span><span className="font-mono text-text-strong">{requires.config.join(', ')}</span></div> : null}
                {clawdis?.primaryEnv && <div className="flex gap-2"><span className="min-w-[60px] text-muted-foreground">Key</span><span className="font-mono text-text-strong">{clawdis.primaryEnv}</span></div>}
                {envVars.length > 0 && (
                  <div className="mt-1 border-t border-border pt-2">
                    <div className="mb-1.5 text-xs text-muted-foreground">Environment Variables</div>
                    {envVars.map(env => (
                      <div key={env.name} className="mt-1 flex items-baseline gap-2">
                        <code className="text-xs text-text-strong">{env.name}</code>
                        {env.required === true && <span className="text-[10px] text-accent">required</span>}
                        {env.required === false && <span className="text-[10px] text-muted-foreground">optional</span>}
                        {env.description && <span className="text-xs text-muted-foreground">— {env.description}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Install specs */}
          {installSpecs.length > 0 && (
            <section className="rounded-lg border border-border bg-bg-subtle p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-strong">Install Dependencies</h3>
              <div className="flex flex-col gap-2.5 text-[13px]">
                {installSpecs.map((spec, i) => {
                  const cmd = formatInstallCmd(spec)
                  return (
                    <div key={i}>
                      <div className="font-medium text-text-strong">{spec.label || installKindLabel(spec.kind)}</div>
                      {spec.bins?.length ? <div className="text-xs text-muted-foreground">Bins: {spec.bins.join(', ')}</div> : null}
                      {cmd && <code className="mt-1 block rounded-md bg-bg px-2.5 py-1.5 font-mono text-xs text-text-strong select-all">{cmd}</code>}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Dependencies */}
          {deps.length > 0 && (
            <section className="rounded-lg border border-border bg-bg-subtle p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-strong">Dependencies</h3>
              <div className="flex flex-col gap-2 text-[13px]">
                {deps.map((dep, i) => (
                  <div key={i}>
                    <span className="font-medium text-text-strong">{dep.name}</span>
                    {dep.type && <span className="ml-1.5 text-muted-foreground">{dep.type}{dep.version ? ` ${dep.version}` : ''}</span>}
                    {dep.url && <div className="mt-0.5 text-xs"><a href={dep.url} target="_blank" rel="noopener" className="text-accent hover:underline">{dep.url}</a></div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Links */}
          {(links?.homepage || links?.repository || links?.documentation) && (
            <section className="rounded-lg border border-border bg-bg-subtle p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-strong">Links</h3>
              <div className="flex flex-col gap-2 text-[13px]">
                {links.homepage && <div className="flex gap-2"><span className="min-w-[50px] text-muted-foreground">Home</span><a href={links.homepage} target="_blank" rel="noopener" className="truncate text-accent hover:underline">{links.homepage}</a></div>}
                {links.repository && <div className="flex gap-2"><span className="min-w-[50px] text-muted-foreground">Repo</span><a href={links.repository} target="_blank" rel="noopener" className="truncate text-accent hover:underline">{links.repository}</a></div>}
                {links.documentation && <div className="flex gap-2"><span className="min-w-[50px] text-muted-foreground">Docs</span><a href={links.documentation} target="_blank" rel="noopener" className="truncate text-accent hover:underline">{links.documentation}</a></div>}
              </div>
            </section>
          )}
        </div>

        {/* Latest version */}
        {latestVersion && (
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-strong">Latest Version</h2>
            <div className="rounded-lg border border-border bg-bg p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-semibold text-text-strong">v{latestVersion.version}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(latestVersion.createdAt)}</span>
              </div>
              {latestVersion.changelog
                ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{latestVersion.changelog}</p>
                : <p className="text-[13px] text-muted-foreground">No changelog provided.</p>
              }
            </div>
          </section>
        )}

        {/* File Browser */}
        {latestVersion?.files?.length ? (
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-strong">Files</h2>
            <div className="flex overflow-hidden rounded-lg border border-border" style={{ minHeight: 300 }}>
              {/* File list */}
              <div className="w-[220px] shrink-0 overflow-y-auto border-r border-border bg-bg-subtle">
                {latestVersion.files.map(f => (
                  <button
                    key={f.path}
                    className={cn(
                      'flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-xs transition-colors',
                      selectedFile === f.path ? 'bg-accent/10 text-accent' : 'text-text hover:bg-bg-hover',
                    )}
                    onClick={() => onSelectFile(f.path)}
                  >
                    <span className="truncate font-mono">{f.path}</span>
                    {f.size != null && <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{formatBytes(f.size)}</span>}
                  </button>
                ))}
              </div>
              {/* File viewer */}
              <div className="flex flex-1 flex-col min-w-0 bg-bg">
                <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
                  <span className="font-mono text-text-strong">{selectedFile ?? 'Select a file'}</span>
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {fileLoading ? <div className="text-[13px] text-muted-foreground">Loading...</div> :
                   fileError ? <div className="text-[13px] text-destructive">{fileError}</div> :
                   fileContent != null ? <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text">{fileContent}</pre> :
                   <div className="text-[13px] text-muted-foreground">Select a file to preview.</div>}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* SKILL.md */}
        {readmeLoading ? (
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-strong">SKILL.md</h2>
            <div className="py-6 text-center text-[13px] text-muted-foreground">Loading...</div>
          </section>
        ) : readme ? (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-strong">SKILL.md</h2>
              <div className="flex overflow-hidden rounded-lg border border-border">
                <button className={cn('px-3 py-1 text-xs transition-colors', !readmeRaw ? 'bg-accent/10 text-accent' : 'text-muted-foreground')} onClick={() => setReadmeRaw(false)}>Rendered</button>
                <button className={cn('border-l border-border px-3 py-1 text-xs transition-colors', readmeRaw ? 'bg-accent/10 text-accent' : 'text-muted-foreground')} onClick={() => setReadmeRaw(true)}>Source</button>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg p-5 text-sm leading-relaxed text-text overflow-x-auto">
              <pre className="whitespace-pre-wrap break-words font-mono text-[13px]">{readme}</pre>
            </div>
          </section>
        ) : null}

        {/* Timeline */}
        <div className="flex gap-4 text-[13px] text-muted-foreground">
          <span>Created {new Date(skill.createdAt).toLocaleDateString()}</span>
          <span>·</span>
          <span>Updated {new Date(skill.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  )
}
