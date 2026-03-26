import { LitElement, html, nothing } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { renderMarkdown } from '../components/markdown'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

// ── Types (mirrors gateway skills.status response) ──

interface Requirements {
  bins?: string[]
  env?: string[]
  config?: string[]
}

interface SkillInstallOption {
  id: string
  kind: string
  label: string
  bins: string[]
}

interface SkillStatusEntry {
  name: string
  description: string
  source: string
  bundled: boolean
  filePath: string
  baseDir: string
  skillKey: string
  primaryEnv?: string
  emoji?: string
  homepage?: string
  always: boolean
  disabled: boolean
  blockedByAllowlist: boolean
  eligible: boolean
  requirements: Requirements
  missing: Requirements
  configChecks: Array<{ path: string; satisfied: boolean; note?: string }>
  install: SkillInstallOption[]
}

interface SkillStatusReport {
  workspaceDir: string
  managedSkillsDir: string
  skills: SkillStatusEntry[]
}

// ── ClawHub API Types ──

interface ClawHubSkillStats {
  downloads: number
  installsCurrent?: number
  installsAllTime?: number
  stars: number
  versions: number
  comments: number
}

interface ClawHubSkill {
  _id: string
  slug: string
  displayName: string
  summary: string | null
  ownerUserId: string
  stats: ClawHubSkillStats
  badges?: { highlighted?: object; official?: object; deprecated?: object }
  createdAt: number
  updatedAt: number
}

interface ClawHubListEntry {
  skill: ClawHubSkill
  latestVersion: { version: string; createdAt: number; changelog?: string } | null
  ownerHandle?: string | null
  owner?: { handle?: string; displayName?: string; image?: string } | null
}

interface ClawHubSearchResult {
  skill: ClawHubSkill
  version?: { version: string } | null
  score: number
  slug?: string
  displayName?: string
  summary?: string | null
  ownerHandle?: string | null
  owner?: { handle?: string; displayName?: string; image?: string } | null
}

interface ClawHubClawdis {
  requires?: {
    bins?: string[]
    anyBins?: string[]
    env?: string[]
    config?: string[]
  }
  primaryEnv?: string
  emoji?: string
  os?: string[]
  envVars?: Array<{ name: string; required?: boolean; description?: string }>
  dependencies?: Array<{ name: string; type?: string; version?: string; url?: string; repository?: string }>
  install?: Array<{ id?: string; kind: string; label?: string; bins?: string[]; formula?: string; tap?: string; package?: string; module?: string }>
  links?: { homepage?: string; repository?: string; documentation?: string }
  nix?: { plugin?: string; systems?: string[] }
  config?: { requiredEnv?: string[]; stateDirs?: string[]; example?: string }
  cliHelp?: string
}

interface ClawHubLatestVersion {
  _id: string
  version: string
  createdAt: number
  changelog?: string
  files?: Array<{ path: string; size?: number }>
  parsed?: { clawdis?: ClawHubClawdis }
}

interface ClawHubDetailResponse {
  skill: ClawHubSkill
  latestVersion: ClawHubLatestVersion | null
  owner?: { handle?: string; displayName?: string; image?: string } | null
  resolvedSlug?: string
}

type OcbotSkillApi = {
  installSkill: (slug: string, version: string, cb: () => void) => void
  uninstallSkill: (slug: string, cb: () => void) => void
}

function getChromeOcbotApi(): Partial<OcbotSkillApi> | null {
  try {
    const chromeObj = (globalThis as { chrome?: { ocbot?: Partial<OcbotSkillApi> } }).chrome
    if (chromeObj?.ocbot) {
      return chromeObj.ocbot as Partial<OcbotSkillApi>
    }
  } catch {
  }
  return null
}

// ── ClawHub Convex API ──

const CONVEX_API_URL = 'https://wry-manatee-359.convex.cloud'
const CONVEX_SITE_URL = 'https://wry-manatee-359.convex.site'

async function convexQuery<T>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${CONVEX_API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, format: 'json', args }),
  })
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limited. Please wait a moment and try again.')
    throw new Error(`Convex query error: ${res.status}`)
  }
  const data = await res.json()
  return data.value ?? data
}

async function convexAction<T>(path: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${CONVEX_API_URL}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, format: 'json', args }),
  })
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limited. Please wait a moment and try again.')
    throw new Error(`Convex action error: ${res.status}`)
  }
  const data = await res.json()
  return data.value ?? data
}

// ── Shared constants ──

type Tab = 'local' | 'clawhub'
type View = 'list' | 'local-detail' | 'marketplace-detail'
type LocalSort = 'name' | 'source' | 'status'
type MarketplaceSort = 'downloads' | 'stars' | 'newest' | 'updated'
type DisplayMode = 'cards' | 'list'

const LOAD_BATCH = 30
const MARKETPLACE_PAGE_SIZE = 25

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

function formatInstallCmd(spec: ClawHubClawdis['install'] extends (infer T)[] | undefined ? T : never): string | null {
  if (!spec) return null
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

@customElement('ocbot-skills-view')
export class OcbotSkillsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  // ── Shared state ──
  @state() private tab: Tab = 'local'
  @state() private view: View = 'list'
  @state() private searchQuery = ''
  @state() private localSort: LocalSort = 'name'
  @state() private sortDropdownOpen = false
  @state() private displayMode: DisplayMode = 'cards'
  @state() private localVisible = LOAD_BATCH
  private searchTimer: ReturnType<typeof setTimeout> | null = null

  // ── Local skills state ──
  @state() private localSkills: SkillStatusEntry[] = []
  @state() private localLoading = true
  @state() private localRefreshing = false
  @state() private localError: string | null = null
  @state() private selectedSkill: SkillStatusEntry | null = null
  @state() private apiKeyInput = ''
  @state() private apiKeyVisible = false
  @state() private savingApiKey = false
  @state() private togglingSkill = false
  @state() private uninstallingSkill = false
  @state() private installingDep: Record<string, boolean> = {}
  @state() private installResult: Record<string, { ok: boolean; message: string }> = {}

  // ── Marketplace state ──
  @state() private mpSkills: ClawHubListEntry[] = []
  @state() private mpLoading = true
  @state() private mpError: string | null = null
  @state() private mpCursor: string | null = null
  @state() private mpHasMore = false
  @state() private mpLoadingMore = false
  @state() private mpSort: MarketplaceSort = 'downloads'
  @state() private mpSearchQuery = ''
  @state() private mpSearchResults: ClawHubSearchResult[] = []
  @state() private mpSearching = false
  @state() private mpDetail: ClawHubDetailResponse | null = null
  @state() private mpDetailLoading = false
  @state() private mpInstalling: Record<string, boolean> = {}
  @state() private mpPendingInstall: Record<string, boolean> = {}
  @state() private mpInstallResult: Record<string, { ok: boolean; message: string }> = {}
  @state() private mpReadme: string | null = null
  @state() private mpReadmeLoading = false
  @state() private mpReadmeRaw = false
  @state() private mpSelectedFile: string | null = null
  @state() private mpFileContent: string | null = null
  @state() private mpFileLoading = false
  @state() private mpFileError: string | null = null
  private mpFileCache = new Map<string, string>()
  private mpSearchTimer: ReturnType<typeof setTimeout> | null = null
  private mpLoaded = false

  override connectedCallback() {
    super.connectedCallback()
    this.style.display = 'flex'
    this.style.flexDirection = 'column'
    this.style.flex = '1'
    this.style.minHeight = '0'
    this.loadLocalSkills()
    this._iframeMessageHandler = this.handleIframeMessage.bind(this)
    window.addEventListener('message', this._iframeMessageHandler)
  }

  // ══════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════

  private async loadLocalSkills(options: { silent?: boolean } = {}) {
    const silent = options.silent === true && this.localSkills.length > 0
    if (silent) {
      this.localRefreshing = true
    } else {
      this.localLoading = true
    }
    this.localError = null
    try {
      const result = await this.gateway.call<SkillStatusReport>('skills.status')
      this.localSkills = result?.skills ?? []
      const pending = { ...this.mpPendingInstall }
      let changed = false
      for (const slug of Object.keys(pending)) {
        if (this.isMarketplaceSkillInstalled(slug)) {
          delete pending[slug]
          changed = true
        }
      }
      if (changed) {
        this.mpPendingInstall = pending
      }
    } catch (err) {
      this.localError = err instanceof Error ? err.message : String(err)
    } finally {
      if (silent) {
        this.localRefreshing = false
      } else {
        this.localLoading = false
      }
    }
  }

  private _iframeMessageHandler: ((e: MessageEvent) => void) | null = null
  private async handleIframeMessage(e: MessageEvent) {
    const data = e.data as { type?: string; slug?: string; requestId?: string }
    if (data?.type !== 'ocbot:clawhub:install') return
    const slug = data.slug || ''
    if (!slug) return
    const requestId = data.requestId || ''
    try {
      const chromeOcbot = getChromeOcbotApi()
      const installSkill = chromeOcbot?.installSkill
      if (typeof installSkill !== 'function') {
        throw new Error('Install API unavailable')
      }
      await new Promise<void>((resolve, reject) => {
        try {
          installSkill(slug, '', () => resolve())
        } catch (err) {
          reject(err)
        }
      })
      const iframe = this.querySelector('iframe')
      iframe?.contentWindow?.postMessage(
        { type: 'ocbot:clawhub:install:result', slug, requestId, ok: true, message: 'Installing...' },
        '*',
      )
    } catch (err) {
      const iframe = this.querySelector('iframe')
      iframe?.contentWindow?.postMessage(
        { type: 'ocbot:clawhub:install:result', slug, requestId, ok: false, message: err instanceof Error ? err.message : String(err) },
        '*',
      )
    }
  }

  private async loadMarketplaceSkills(reset = true) {
    if (reset) {
      this.mpLoading = true
      this.mpError = null
      this.mpSkills = []
      this.mpCursor = null
    }
    try {
      const args: Record<string, unknown> = {
        sort: this.mpSort === 'newest' ? 'newest' : this.mpSort,
        dir: 'desc',
        numItems: MARKETPLACE_PAGE_SIZE,
        highlightedOnly: false,
        nonSuspiciousOnly: true,
      }
      if (!reset && this.mpCursor) args.cursor = this.mpCursor
      const resp = await convexQuery<{ page: ClawHubListEntry[]; hasMore: boolean; nextCursor: string | null }>(
        'skills:listPublicPageV4', args,
      )
      this.mpSkills = reset ? resp.page : [...this.mpSkills, ...resp.page]
      this.mpCursor = resp.nextCursor
      this.mpHasMore = resp.hasMore
    } catch (err) {
      this.mpError = err instanceof Error ? err.message : String(err)
    } finally {
      this.mpLoading = false
      this.mpLoadingMore = false
    }
  }

  private async loadMoreMarketplace() {
    if (this.mpLoadingMore || !this.mpHasMore) return
    this.mpLoadingMore = true
    await this.loadMarketplaceSkills(false)
  }

  private async searchMarketplace(query: string) {
    if (!query.trim()) {
      this.mpSearchResults = []
      this.mpSearching = false
      return
    }
    this.mpSearching = true
    try {
      const results = await convexAction<ClawHubSearchResult[]>('search:searchSkills', {
        query: query.trim(),
        limit: 50,
        highlightedOnly: false,
        nonSuspiciousOnly: true,
      })
      this.mpSearchResults = results ?? []
    } catch {
      this.mpSearchResults = []
    } finally {
      this.mpSearching = false
    }
  }

  private async loadMarketplaceDetail(slug: string) {
    this.mpDetailLoading = true
    this.mpDetail = null
    this.mpReadme = null
    this.mpReadmeLoading = false
    this.mpReadmeRaw = false
    this.mpSelectedFile = null
    this.mpFileContent = null
    this.mpFileLoading = false
    this.mpFileError = null
    this.mpFileCache.clear()
    this.view = 'marketplace-detail'
    try {
      const detail = await convexQuery<ClawHubDetailResponse>('skills:getBySlug', { slug })
      this.mpDetail = detail
      // Load README in background
      if (detail?.latestVersion?._id) {
        this.mpReadmeLoading = true
        convexAction<{ text: string }>('skills:getReadme', { versionId: detail.latestVersion._id })
          .then(data => { this.mpReadme = stripFrontmatter(data.text) })
          .catch(() => { this.mpReadme = null })
          .finally(() => { this.mpReadmeLoading = false })
      }
    } catch (err) {
      this.mpError = err instanceof Error ? err.message : String(err)
      this.view = 'list'
    } finally {
      this.mpDetailLoading = false
    }
  }

  private async installMarketplaceSkill(slug: string, version?: string) {
    this.mpInstalling = { ...this.mpInstalling, [slug]: true }
    try {
      const chromeOcbot = getChromeOcbotApi()
      const installSkill = chromeOcbot?.installSkill
      if (typeof installSkill !== 'function') {
        throw new Error('Install API unavailable')
      }
      await new Promise<void>((resolve, reject) => {
        try {
          installSkill(slug, version ?? '', () => resolve())
        } catch (err) {
          reject(err)
        }
      })
      this.mpPendingInstall = { ...this.mpPendingInstall, [slug]: true }
      delete this.mpInstallResult[slug]
      this.mpInstallResult = { ...this.mpInstallResult }
    } catch (err) {
      this.mpInstallResult = {
        ...this.mpInstallResult,
        [slug]: { ok: false, message: err instanceof Error ? err.message : String(err) },
      }
    } finally {
      this.mpInstalling = { ...this.mpInstalling, [slug]: false }
    }
  }

  private normalizeMarketplaceSkillId(value: string | undefined | null): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/\\/g, '/')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  private isMarketplaceSkillInstalled(slug: string): boolean {
    const normalizedSlug = this.normalizeMarketplaceSkillId(slug)
    if (!normalizedSlug) return false

    return this.localSkills.some(skill => {
      const candidates = [
        skill.skillKey,
        skill.name,
        skill.baseDir,
        skill.filePath,
      ]

      return candidates.some(candidate => {
        const normalized = this.normalizeMarketplaceSkillId(candidate)
        return normalized === normalizedSlug ||
          normalized.endsWith(`-${normalizedSlug}`) ||
          normalized.includes(`skills-${normalizedSlug}`) ||
          normalized.includes(`/${normalizedSlug}`.replace(/\//g, '-'))
      })
    })
  }

  private getManagedSkillSlug(skill: SkillStatusEntry): string | null {
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

    return fromPath(skill.baseDir) ??
      fromPath(skill.filePath) ??
      fromPath(skill.skillKey)
  }

  private canUninstallSkill(skill: SkillStatusEntry): boolean {
    return this.getManagedSkillSlug(skill) !== null
  }

  private async uninstallSkill(skill: SkillStatusEntry) {
    const slug = this.getManagedSkillSlug(skill)
    if (!slug) return
    const confirmed = globalThis.confirm(`Uninstall ${skill.name}?`)
    if (!confirmed) return

    this.uninstallingSkill = true
    try {
      const chromeOcbot = getChromeOcbotApi()
      const uninstallSkill = chromeOcbot?.uninstallSkill
      if (typeof uninstallSkill !== 'function') {
        throw new Error('Uninstall API unavailable')
      }
      await new Promise<void>((resolve, reject) => {
        try {
          uninstallSkill(slug, () => resolve())
        } catch (err) {
          reject(err)
        }
      })
      await this.loadLocalSkills({ silent: true })
      delete this.mpPendingInstall[slug]
      this.mpPendingInstall = { ...this.mpPendingInstall }
      delete this.mpInstallResult[slug]
      this.mpInstallResult = { ...this.mpInstallResult }
      if (this.selectedSkill?.skillKey === skill.skillKey) {
        this.backToList()
      }
    } catch (err) {
      this.localError = err instanceof Error ? err.message : String(err)
    } finally {
      this.uninstallingSkill = false
    }
  }

  private async uninstallMarketplaceSkill(slug: string, displayName?: string) {
    if (!slug) return
    const skill = this.localSkills.find(entry => this.getManagedSkillSlug(entry) === slug) ?? null
    if (skill) {
      await this.uninstallSkill(skill)
      return
    }

    const confirmed = globalThis.confirm(`Uninstall ${displayName || slug}?`)
    if (!confirmed) return

    this.uninstallingSkill = true
    try {
      const chromeOcbot = getChromeOcbotApi()
      const uninstallSkill = chromeOcbot?.uninstallSkill
      if (typeof uninstallSkill !== 'function') {
        throw new Error('Uninstall API unavailable')
      }
      await new Promise<void>((resolve, reject) => {
        try {
          uninstallSkill(slug, () => resolve())
        } catch (err) {
          reject(err)
        }
      })
      await this.loadLocalSkills({ silent: true })
      delete this.mpPendingInstall[slug]
      this.mpPendingInstall = { ...this.mpPendingInstall }
      delete this.mpInstallResult[slug]
      this.mpInstallResult = { ...this.mpInstallResult }
    } catch (err) {
      this.localError = err instanceof Error ? err.message : String(err)
    } finally {
      this.uninstallingSkill = false
    }
  }

  private async selectFile(path: string) {
    const versionId = this.mpDetail?.latestVersion?._id
    if (!versionId) return
    this.mpSelectedFile = path
    this.mpFileError = null

    const cacheKey = `${versionId}:${path}`
    const cached = this.mpFileCache.get(cacheKey)
    if (cached !== undefined) {
      this.mpFileContent = cached
      return
    }

    this.mpFileContent = null
    this.mpFileLoading = true
    try {
      const data = await convexAction<{ text: string }>('skills:getFileText', { versionId, path })
      this.mpFileCache.set(cacheKey, data.text)
      this.mpFileContent = data.text
    } catch (err) {
      this.mpFileError = err instanceof Error ? err.message : String(err)
    } finally {
      this.mpFileLoading = false
    }
  }

  // ══════════════════════════════════════
  // LOCAL SKILL ACTIONS
  // ══════════════════════════════════════

  private async toggleSkill(skill: SkillStatusEntry) {
    this.togglingSkill = true
    try {
      await this.gateway.call('skills.update', { skillKey: skill.skillKey, enabled: skill.disabled })
      await this.loadLocalSkills()
      this.selectedSkill = this.localSkills.find(s => s.skillKey === skill.skillKey) ?? null
    } catch (err) {
      console.error('toggle skill failed:', err)
    } finally {
      this.togglingSkill = false
    }
  }

  private async saveApiKey(skill: SkillStatusEntry) {
    this.savingApiKey = true
    try {
      await this.gateway.call('skills.update', { skillKey: skill.skillKey, apiKey: this.apiKeyInput })
      await this.loadLocalSkills()
      this.selectedSkill = this.localSkills.find(s => s.skillKey === skill.skillKey) ?? null
    } catch (err) {
      console.error('save api key failed:', err)
    } finally {
      this.savingApiKey = false
    }
  }

  private async installDep(skill: SkillStatusEntry, option: SkillInstallOption) {
    const key = `${skill.skillKey}:${option.id}`
    this.installingDep = { ...this.installingDep, [key]: true }
    delete this.installResult[key]
    this.installResult = { ...this.installResult }
    try {
      const result = await this.gateway.call<{ ok: boolean; message?: string }>(
        'skills.install',
        { name: skill.name, installId: option.id, timeoutMs: 120_000 },
      )
      this.installResult = {
        ...this.installResult,
        [key]: { ok: result?.ok !== false, message: result?.ok !== false ? 'Installed' : (result?.message ?? 'Failed') },
      }
      if (result?.ok !== false) {
        await this.loadLocalSkills()
        this.selectedSkill = this.localSkills.find(s => s.skillKey === skill.skillKey) ?? null
      }
    } catch (err) {
      this.installResult = {
        ...this.installResult,
        [key]: { ok: false, message: err instanceof Error ? err.message : String(err) },
      }
    } finally {
      this.installingDep = { ...this.installingDep, [key]: false }
    }
  }

  // ══════════════════════════════════════
  // NAVIGATION
  // ══════════════════════════════════════

  private openLocalDetail(skill: SkillStatusEntry) {
    this.selectedSkill = skill
    this.apiKeyInput = ''
    this.apiKeyVisible = false
    this.installResult = {}
    this.view = 'local-detail'
  }

  private backToList() {
    this.view = 'list'
    this.selectedSkill = null
    this.mpDetail = null
  }

  private onSearchInput(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value
    if (this.tab === 'local') {
      this.searchQuery = value
      this.localVisible = LOAD_BATCH
    } else {
      this.mpSearchQuery = value
      if (this.mpSearchTimer) clearTimeout(this.mpSearchTimer)
      this.mpSearchTimer = setTimeout(() => this.searchMarketplace(value), 300)
    }
  }

  private switchTab(tab: Tab) {
    this.tab = tab
    this.view = 'list'
    this.localVisible = LOAD_BATCH
    this.selectedSkill = null
    this.mpDetail = null
    this.sortDropdownOpen = false
    if (tab === 'clawhub' && !this.mpLoaded) {
      this.mpLoaded = true
      this.loadMarketplaceSkills()
    }
  }

  private onMarketplaceSortChange(sort: MarketplaceSort) {
    this.mpSort = sort
    this.sortDropdownOpen = false
    this.mpSearchQuery = ''
    this.mpSearchResults = []
    this.loadMarketplaceSkills()
  }

  private onMarketplaceScroll(e: Event) {
    const el = e.target as HTMLElement
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      if (!this.mpSearchQuery.trim()) {
        this.loadMoreMarketplace()
      }
    }
  }

  // ══════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════

  private onLocalListScroll(e: Event) {
    const el = e.target as HTMLElement
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      const total = this.getFilteredLocalSkills().length
      if (this.localVisible < total) this.localVisible += LOAD_BATCH
    }
  }

  private getFilteredLocalSkills(): SkillStatusEntry[] {
    const q = this.searchQuery.toLowerCase().trim()
    let skills = q
      ? this.localSkills.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.skillKey.toLowerCase().includes(q)
        )
      : [...this.localSkills]
    switch (this.localSort) {
      case 'name':
        skills.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'source':
        skills.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name))
        break
      case 'status':
        skills.sort((a, b) => {
          const rank = (s: SkillStatusEntry) => s.eligible ? 0 : s.disabled ? 2 : 1
          return rank(a) - rank(b) || a.name.localeCompare(b.name)
        })
        break
    }
    return skills
  }

  private getStatusInfo(s: SkillStatusEntry): { color: string; label: string } {
    if (s.disabled) return { color: 'var(--muted)', label: 'Disabled' }
    if (s.blockedByAllowlist) return { color: 'var(--danger)', label: 'Blocked' }
    if (s.eligible) return { color: 'var(--ok)', label: 'Active' }
    const hasMissing = (s.missing.bins?.length ?? 0) > 0 || (s.missing.env?.length ?? 0) > 0 || (s.missing.config?.length ?? 0) > 0
    if (hasMissing) return { color: 'var(--warn)', label: 'Missing deps' }
    return { color: 'var(--muted)', label: 'Inactive' }
  }

  private getSourceLabel(source: string): string {
    if (source === 'openclaw-bundled') return 'bundled'
    return source
  }

  private getMarketplaceBadges(skill: ClawHubSkill): string[] {
    const badges: string[] = []
    if (skill.badges?.highlighted) badges.push('Featured')
    if (skill.badges?.official) badges.push('Official')
    if (skill.badges?.deprecated) badges.push('Deprecated')
    return badges
  }

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════

  override render() {
    if (this.view === 'local-detail' && this.selectedSkill) return this.renderLocalDetailPage()
    if (this.view === 'marketplace-detail') return this.renderMarketplaceDetailPage()
    return this.renderListPage()
  }

  // ──────────────────────────────────────
  // LIST PAGE
  // ──────────────────────────────────────

  private renderListPage() {
    const showToolbar = this.tab === 'local'
      ? this.localSkills.length > 0
      : (!this.mpLoading || this.mpSkills.length > 0)

    return html`
      <div style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
        <!-- Header area -->
        <div style="padding:24px 24px 0;">
          <h1 style="font-size:22px; font-weight:600; letter-spacing:-0.02em; color:var(--text-strong); margin:0;">Skills</h1>
          <p style="font-size:14px; color:var(--muted); margin:4px 0 0;">Browse and manage your AI skills</p>

          <!-- Tabs -->
          <div style="display:flex; gap:16px; border-bottom:1px solid var(--border); margin-top:16px;">
            ${this.renderTabBtn('local', `My Skills (${this.localSkills.length})`)}
            ${this.renderTabBtn('clawhub', 'Marketplace')}
          </div>

          <!-- Toolbar -->
          ${showToolbar ? html`
            <div style="display:flex; align-items:center; gap:10px; margin-top:16px;">
              <div style="position:relative; max-width:400px; flex:1;">
                <svg style="position:absolute; left:12px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--muted); pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  placeholder="${this.tab === 'local' ? 'Search skills...' : 'Search marketplace...'}"
                  .value=${this.tab === 'local' ? this.searchQuery : this.mpSearchQuery}
                  @input=${this.onSearchInput}
                  style="width:100%; padding:10px 16px 10px 36px; font-size:14px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg); color:var(--text-strong); outline:none; transition:border-color 0.15s;"
                />
              </div>
              ${this.renderSortDropdown()}
              ${this.tab === 'local' ? html`
                <button
                  class="btn btn--sm"
                  style="display:flex; align-items:center; gap:6px; padding:8px 12px; font-size:13px; white-space:nowrap;"
                  ?disabled=${this.localRefreshing}
                  @click=${() => this.loadLocalSkills({ silent: true })}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"/>
                  </svg>
                  ${this.localRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              ` : nothing}
              ${this.renderViewToggle()}
            </div>
          ` : nothing}
        </div>

        <!-- Content -->
        ${this.tab === 'local' ? html`
          <div
            style="flex:1; overflow-y:scroll; padding:12px 24px 24px;"
            @scroll=${this.onLocalListScroll}
          >
            ${this.renderLocalGrid()}
          </div>
        ` : html`
          <div
            style="flex:1; overflow-y:scroll; padding:12px 24px 24px;"
            @scroll=${this.onMarketplaceScroll}
          >
            ${this.renderMarketplaceGrid()}
          </div>
        `}
      </div>
    `
  }

  private renderTabBtn(tab: Tab, label: string) {
    const active = this.tab === tab
    return html`
      <button
        style="padding:8px 0; font-size:14px; border:none; cursor:pointer; background:transparent; transition:color 0.15s; border-bottom:2px solid ${active ? 'var(--accent)' : 'transparent'}; font-weight:${active ? '600' : '400'}; color:${active ? 'var(--text-strong)' : 'var(--muted)'};"
        @click=${() => this.switchTab(tab)}
      >${label}</button>
    `
  }

  private renderSortDropdown() {
    const isLocal = this.tab === 'local'
    const options = isLocal ? LOCAL_SORT_OPTIONS : MARKETPLACE_SORT_OPTIONS
    const current = isLocal ? this.localSort : this.mpSort
    const currentLabel = options.find(o => o.value === current)?.label ?? 'Sort'

    return html`
      <div style="position:relative;">
        <button
          class="btn btn--sm"
          style="display:flex; align-items:center; gap:6px; padding:8px 12px; font-size:13px; white-space:nowrap;"
          @click=${(e: Event) => { e.stopPropagation(); this.sortDropdownOpen = !this.sortDropdownOpen }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/>
          </svg>
          ${currentLabel}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        ${this.sortDropdownOpen ? html`
          <div
            style="position:fixed; inset:0; z-index:99;"
            @click=${() => { this.sortDropdownOpen = false }}
          ></div>
          <div style="position:absolute; right:0; top:100%; margin-top:4px; z-index:100; min-width:160px; padding:4px 0; background:var(--card); border:1px solid var(--border); border-radius:var(--radius-md); box-shadow:0 4px 16px rgba(0,0,0,0.12);">
            ${options.map(opt => html`
              <button
                style="display:flex; align-items:center; gap:8px; width:100%; padding:8px 14px; border:none; background:${opt.value === current ? 'var(--accent-subtle)' : 'transparent'}; color:${opt.value === current ? 'var(--accent)' : 'var(--text-strong)'}; font-size:13px; cursor:pointer; text-align:left; transition:background 0.1s;"
                @mouseenter=${(e: MouseEvent) => { if (opt.value !== current) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.background = opt.value === current ? 'var(--accent-subtle)' : 'transparent' }}
                @click=${() => {
                  if (isLocal) {
                    this.localSort = opt.value as LocalSort
                    this.sortDropdownOpen = false
                    this.localVisible = LOAD_BATCH
                  } else {
                    this.onMarketplaceSortChange(opt.value as MarketplaceSort)
                  }
                }}
              >
                ${opt.value === current ? html`
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ` : html`<span style="width:14px;"></span>`}
                ${opt.label}
              </button>
            `)}
          </div>
        ` : nothing}
      </div>
    `
  }

  private renderViewToggle() {
    const iconStyle = (active: boolean) =>
      `padding:7px; border:none; border-radius:var(--radius-md); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.1s;` +
      (active ? 'background:var(--accent-subtle); color:var(--accent);' : 'background:transparent; color:var(--muted);')
    return html`
      <div style="display:flex; border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden;">
        <button style="${iconStyle(this.displayMode === 'cards')}" title="Cards" @click=${() => { this.displayMode = 'cards' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>
        <button style="${iconStyle(this.displayMode === 'list')}; border-left:1px solid var(--border);" title="List" @click=${() => { this.displayMode = 'list' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        </button>
      </div>
    `
  }

  // ──────────────────────────────────────
  // LOCAL GRID
  // ──────────────────────────────────────

  private renderLocalGrid() {
    if (this.localLoading) return this.renderEmpty('Loading...')
    if (this.localError) return html`<div style="text-align:center; color:var(--danger); padding:48px;">${this.localError}</div>`
    const skills = this.getFilteredLocalSkills()
    if (skills.length === 0) {
      if (this.searchQuery) return this.renderEmpty('No matching skills')
      return html`
        <div style="display:flex; flex-direction:column; align-items:center; gap:12px; padding:48px; color:var(--muted); font-size:14px;">
          <span>No skills installed</span>
          <button
            class="btn"
            style="border-color:var(--accent); background:var(--accent-subtle); color:var(--accent);"
            @click=${() => this.switchTab('clawhub')}
          >Browse Marketplace</button>
        </div>
      `
    }
    const visible = skills.slice(0, this.localVisible)
    return html`
      ${this.displayMode === 'cards' ? html`
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${visible.map(s => this.renderLocalCard(s))}
        </div>
      ` : html`
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${visible.map(s => this.renderLocalListRow(s))}
        </div>
      `}
      ${visible.length < skills.length ? html`
        <div style="text-align:center; color:var(--muted); padding:16px; font-size:13px;">Loading more...</div>
      ` : nothing}
    `
  }

  private renderLocalCard(skill: SkillStatusEntry) {
    const status = this.getStatusInfo(skill)
    const uninstallable = this.canUninstallSkill(skill)
    return html`
      <div
        style="display:flex; flex-direction:column; min-width:0; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; background:var(--card); cursor:pointer; transition:all 0.15s; box-shadow:var(--shadow-sm, none);"
        @click=${() => this.openLocalDetail(skill)}
        @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong, var(--border))' }}
        @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm, none)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      >
        <div style="display:flex; align-items:flex-start; gap:14px;">
          <div style="width:48px; height:48px; border-radius:var(--radius-lg); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:14px; font-weight:600; color:var(--accent);">
            ${skill.emoji || getSkillAbbr(skill.name)}
          </div>
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:15px; font-weight:600; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; letter-spacing:-0.02em;">
                ${skill.name}
              </span>
              <span style="display:inline-flex; align-items:center; gap:4px; padding:1px 8px; border-radius:6px; font-size:10px; font-weight:500; flex-shrink:0; border:1px solid ${status.color}30; background:${status.color}10; color:${status.color};">
                ${status.label}
              </span>
            </div>
            <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">
              <span style="padding:1px 8px; border-radius:6px; border:1px solid var(--border); font-size:10px; color:var(--muted);">
                ${this.getSourceLabel(skill.source)}
              </span>
            </div>
          </div>
        </div>
        <p style="margin:12px 0 0; font-size:13px; color:var(--muted); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; flex:1;">
          ${skill.description || 'No description'}
        </p>
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--border); margin-top:12px; padding-top:12px; font-size:12px; color:var(--muted);">
          <span style="font-family:var(--font-mono, monospace);">${skill.skillKey}</span>
          <div style="display:flex; align-items:center; gap:8px;">
            ${uninstallable ? html`
              <button
                class="btn btn--sm"
                style="padding:3px 12px; font-size:11px; color:var(--danger); border-color:color-mix(in srgb, var(--danger) 45%, var(--border));"
                ?disabled=${this.uninstallingSkill}
                @click=${(e: Event) => { e.stopPropagation(); this.uninstallSkill(skill) }}
              >${this.uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
            ` : nothing}
            ${skill.homepage ? html`<span>\u2197</span>` : nothing}
          </div>
        </div>
      </div>
    `
  }

  private renderLocalListRow(skill: SkillStatusEntry) {
    const status = this.getStatusInfo(skill)
    const uninstallable = this.canUninstallSkill(skill)
    return html`
      <div
        class="session-card"
        style="display:flex; align-items:center; gap:12px; cursor:pointer;"
        @click=${() => this.openLocalDetail(skill)}
      >
        <div style="width:36px; height:36px; border-radius:var(--radius-md); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:12px; font-weight:600; color:var(--accent);">
          ${skill.emoji || getSkillAbbr(skill.name)}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px; font-weight:500; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${skill.name}</span>
            <span style="padding:1px 6px; border-radius:4px; font-size:10px; font-weight:500; border:1px solid ${status.color}30; background:${status.color}10; color:${status.color}; flex-shrink:0;">${status.label}</span>
          </div>
          ${skill.description ? html`
            <div style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">${skill.description}</div>
          ` : nothing}
        </div>
        <span style="font-size:11px; padding:2px 8px; border-radius:4px; border:1px solid var(--border); color:var(--muted); flex-shrink:0;">${this.getSourceLabel(skill.source)}</span>
        ${uninstallable ? html`
          <button
            class="btn btn--sm"
            style="padding:3px 12px; font-size:11px; color:var(--danger); border-color:color-mix(in srgb, var(--danger) 45%, var(--border)); flex-shrink:0;"
            ?disabled=${this.uninstallingSkill}
            @click=${(e: Event) => { e.stopPropagation(); this.uninstallSkill(skill) }}
          >${this.uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
        ` : nothing}
      </div>
    `
  }

  // ──────────────────────────────────────
  // MARKETPLACE GRID
  // ──────────────────────────────────────

  private renderMarketplaceGrid() {
    if (this.mpLoading && this.mpSkills.length === 0) return this.renderEmpty('Loading marketplace...')
    if (this.mpError && this.mpSkills.length === 0) return html`
      <div style="display:flex; flex-direction:column; align-items:center; gap:12px; padding:48px; color:var(--muted); font-size:14px;">
        <div style="color:var(--danger);">${this.mpError}</div>
        <button class="btn" @click=${() => this.loadMarketplaceSkills()}>Retry</button>
      </div>
    `

    // If searching, show search results
    if (this.mpSearchQuery.trim()) {
      return this.renderMarketplaceSearchResults()
    }

    const skills = this.mpSkills
    if (skills.length === 0) return this.renderEmpty('No skills available')

    return html`
      ${this.displayMode === 'cards' ? html`
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${skills.map(entry => this.renderMarketplaceCard(entry))}
        </div>
      ` : html`
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${skills.map(entry => this.renderMarketplaceListRow(entry))}
        </div>
      `}
      ${this.mpLoadingMore ? html`
        <div style="text-align:center; color:var(--muted); padding:16px; font-size:13px;">Loading more...</div>
      ` : this.mpHasMore ? html`
        <div style="text-align:center; padding:16px;">
          <button class="btn btn--sm" @click=${() => this.loadMoreMarketplace()}>Load more</button>
        </div>
      ` : nothing}
    `
  }

  private renderMarketplaceSearchResults() {
    if (this.mpSearching) return this.renderEmpty('Searching...')
    if (this.mpSearchResults.length === 0) return this.renderEmpty('No results found')

    return html`
      ${this.displayMode === 'cards' ? html`
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${this.mpSearchResults.map(r => this.renderSearchResultCard(r))}
        </div>
      ` : html`
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${this.mpSearchResults.map(r => this.renderSearchResultListRow(r))}
        </div>
      `}
    `
  }

  private renderMarketplaceCard(entry: ClawHubListEntry) {
    const { skill, owner, latestVersion } = entry
    const badges = this.getMarketplaceBadges(skill)
    const installing = this.mpInstalling[skill.slug] || this.mpPendingInstall[skill.slug]
    const result = this.mpInstallResult[skill.slug]
    const installed = this.isMarketplaceSkillInstalled(skill.slug) || result?.ok === true

    return html`
      <div
        style="display:flex; flex-direction:column; min-width:0; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; background:var(--card); cursor:pointer; transition:all 0.15s; box-shadow:var(--shadow-sm, none);"
        @click=${() => this.loadMarketplaceDetail(skill.slug)}
        @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong, var(--border))' }}
        @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm, none)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      >
        <div style="display:flex; align-items:flex-start; gap:14px;">
          <div style="width:48px; height:48px; border-radius:var(--radius-lg); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:14px; font-weight:600; color:var(--accent);">
            ${getSkillAbbr(skill.displayName)}
          </div>
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span style="font-size:15px; font-weight:600; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; letter-spacing:-0.02em;">
                ${skill.displayName}
              </span>
              ${badges.map(b => html`
                <span style="display:inline-flex; padding:1px 8px; border-radius:6px; font-size:10px; font-weight:500; flex-shrink:0; border:1px solid var(--accent)30; background:var(--accent-subtle); color:var(--accent);">
                  ${b}
                </span>
              `)}
            </div>
            <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
              ${owner?.handle ? html`
                <span style="padding:1px 8px; border-radius:6px; border:1px solid var(--border); font-size:10px; color:var(--muted);">
                  @${owner.handle || owner.displayName}
                </span>
              ` : nothing}
              ${latestVersion ? html`
                <span style="padding:1px 8px; border-radius:6px; border:1px solid var(--border); font-size:10px; color:var(--muted);">
                  v${latestVersion.version}
                </span>
              ` : nothing}
            </div>
          </div>
        </div>
        <p style="margin:12px 0 0; font-size:13px; color:var(--muted); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; flex:1;">
          ${skill.summary || 'No description'}
        </p>
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--border); margin-top:12px; padding-top:12px; font-size:12px; color:var(--muted);">
          <div style="display:flex; gap:12px;">
            <span title="Downloads">\u2B07 ${formatNumber(skill.stats.downloads)}</span>
            <span title="Stars">\u2605 ${formatNumber(skill.stats.stars)}</span>
            ${skill.stats.installsCurrent != null ? html`
              <span title="Active installs">\u229A ${formatNumber(skill.stats.installsCurrent)}</span>
            ` : nothing}
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${installed ? html`
              <span style="font-size:11px; color:var(--ok);">\u2713 Installed</span>
              <button
                class="btn btn--sm"
                style="padding:3px 12px; font-size:11px; color:var(--danger); border-color:color-mix(in srgb, var(--danger) 45%, var(--border));"
                ?disabled=${this.uninstallingSkill}
                @click=${(e: Event) => { e.stopPropagation(); this.uninstallMarketplaceSkill(skill.slug, skill.displayName) }}
              >${this.uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
            ` : html`
              <button
                class="btn btn--sm"
                style="padding:3px 12px; font-size:11px; border-color:var(--accent); color:var(--accent); background:var(--accent-subtle);"
                ?disabled=${installing}
                @click=${(e: Event) => { e.stopPropagation(); this.installMarketplaceSkill(skill.slug, entry.latestVersion?.version) }}
              >${installing ? 'Installing...' : 'Install'}</button>
            `}
          </div>
        </div>
      </div>
    `
  }

  private renderMarketplaceListRow(entry: ClawHubListEntry) {
    const { skill, owner } = entry
    const installing = this.mpInstalling[skill.slug] || this.mpPendingInstall[skill.slug]
    const result = this.mpInstallResult[skill.slug]
    const installed = this.isMarketplaceSkillInstalled(skill.slug) || result?.ok === true

    return html`
      <div
        class="session-card"
        style="display:flex; align-items:center; gap:12px; cursor:pointer;"
        @click=${() => this.loadMarketplaceDetail(skill.slug)}
      >
        <div style="width:36px; height:36px; border-radius:var(--radius-md); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:12px; font-weight:600; color:var(--accent);">
          ${getSkillAbbr(skill.displayName)}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px; font-weight:500; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${skill.displayName}</span>
            <span style="font-size:11px; color:var(--muted);">\u2B07 ${formatNumber(skill.stats.downloads)}</span>
            <span style="font-size:11px; color:var(--muted);">\u2605 ${formatNumber(skill.stats.stars)}</span>
          </div>
          ${skill.summary ? html`
            <div style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">${skill.summary}</div>
          ` : nothing}
        </div>
        ${owner?.handle ? html`
          <span style="font-size:11px; padding:2px 8px; border-radius:4px; border:1px solid var(--border); color:var(--muted); flex-shrink:0;">@${owner.handle || owner.displayName}</span>
        ` : nothing}
        ${installed ? html`
          <span style="font-size:11px; color:var(--ok); flex-shrink:0;">\u2713</span>
          <button
            class="btn btn--sm"
            style="padding:3px 12px; font-size:11px; color:var(--danger); border-color:color-mix(in srgb, var(--danger) 45%, var(--border)); flex-shrink:0;"
            ?disabled=${this.uninstallingSkill}
            @click=${(e: Event) => { e.stopPropagation(); this.uninstallMarketplaceSkill(skill.slug, skill.displayName) }}
          >${this.uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
        ` : html`
          <button
            class="btn btn--sm"
            style="padding:3px 12px; font-size:11px; border-color:var(--accent); color:var(--accent); background:var(--accent-subtle); flex-shrink:0;"
            ?disabled=${installing}
            @click=${(e: Event) => { e.stopPropagation(); this.installMarketplaceSkill(skill.slug, entry.latestVersion?.version) }}
          >${installing ? 'Installing...' : 'Install'}</button>
        `}
      </div>
    `
  }

  private renderSearchResultCard(r: ClawHubSearchResult) {
    const name = r.skill?.displayName ?? r.displayName ?? r.slug ?? '?'
    const slug = r.skill?.slug ?? r.slug ?? ''
    const summary = r.skill?.summary ?? r.summary ?? null
    const version = r.version?.version
    const installing = this.mpInstalling[slug] || this.mpPendingInstall[slug]
    const result = this.mpInstallResult[slug]
    const installed = this.isMarketplaceSkillInstalled(slug) || result?.ok === true

    return html`
      <div
        style="display:flex; flex-direction:column; min-width:0; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; background:var(--card); cursor:pointer; transition:all 0.15s; box-shadow:var(--shadow-sm, none);"
        @click=${() => slug && this.loadMarketplaceDetail(slug)}
        @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong, var(--border))' }}
        @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm, none)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      >
        <div style="display:flex; align-items:flex-start; gap:14px;">
          <div style="width:48px; height:48px; border-radius:var(--radius-lg); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:14px; font-weight:600; color:var(--accent);">
            ${getSkillAbbr(name)}
          </div>
          <div style="min-width:0; flex:1;">
            <span style="font-size:15px; font-weight:600; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; letter-spacing:-0.02em; display:block;">
              ${name}
            </span>
            ${version ? html`
              <div style="margin-top:6px;">
                <span style="padding:1px 8px; border-radius:6px; border:1px solid var(--border); font-size:10px; color:var(--muted);">v${version}</span>
              </div>
            ` : nothing}
          </div>
        </div>
        <p style="margin:12px 0 0; font-size:13px; color:var(--muted); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; flex:1;">
          ${summary || 'No description'}
        </p>
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--border); margin-top:12px; padding-top:12px; font-size:12px; color:var(--muted);">
          <span style="font-family:var(--font-mono, monospace);">${slug}</span>
          ${installed ? html`
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:11px; color:var(--ok);">\u2713 Installed</span>
              <button
                class="btn btn--sm"
                style="padding:3px 12px; font-size:11px; color:var(--danger); border-color:color-mix(in srgb, var(--danger) 45%, var(--border));"
                ?disabled=${this.uninstallingSkill}
                @click=${(e: Event) => { e.stopPropagation(); slug && this.uninstallMarketplaceSkill(slug, name) }}
              >${this.uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
            </div>
          ` : html`
            <button
              class="btn btn--sm"
              style="padding:3px 12px; font-size:11px; border-color:var(--accent); color:var(--accent); background:var(--accent-subtle);"
              ?disabled=${installing}
              @click=${(e: Event) => { e.stopPropagation(); slug && this.installMarketplaceSkill(slug, version) }}
              >${installing ? 'Installing...' : 'Install'}</button>
          `}
        </div>
      </div>
    `
  }

  private renderSearchResultListRow(r: ClawHubSearchResult) {
    const name = r.skill?.displayName ?? r.displayName ?? r.slug ?? '?'
    const slug = r.skill?.slug ?? r.slug ?? ''
    const summary = r.skill?.summary ?? r.summary ?? null
    const version = r.version?.version
    const installing = this.mpInstalling[slug] || this.mpPendingInstall[slug]
    const result = this.mpInstallResult[slug]
    const installed = this.isMarketplaceSkillInstalled(slug) || result?.ok === true

    return html`
      <div
        class="session-card"
        style="display:flex; align-items:center; gap:12px; cursor:pointer;"
        @click=${() => slug && this.loadMarketplaceDetail(slug)}
      >
        <div style="width:36px; height:36px; border-radius:var(--radius-md); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:12px; font-weight:600; color:var(--accent);">
          ${getSkillAbbr(name)}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px; font-weight:500; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</span>
          </div>
          ${summary ? html`
            <div style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">${summary}</div>
          ` : nothing}
        </div>
        <span style="font-size:11px; padding:2px 8px; border-radius:4px; border:1px solid var(--border); color:var(--muted); flex-shrink:0;">${slug}</span>
        ${installed ? html`
          <span style="font-size:11px; color:var(--ok); flex-shrink:0;">\u2713</span>
          <button
            class="btn btn--sm"
            style="padding:3px 12px; font-size:11px; color:var(--danger); border-color:color-mix(in srgb, var(--danger) 45%, var(--border)); flex-shrink:0;"
            ?disabled=${this.uninstallingSkill}
            @click=${(e: Event) => { e.stopPropagation(); slug && this.uninstallMarketplaceSkill(slug, name) }}
          >${this.uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
        ` : html`
          <button
            class="btn btn--sm"
            style="padding:3px 12px; font-size:11px; border-color:var(--accent); color:var(--accent); background:var(--accent-subtle); flex-shrink:0;"
            ?disabled=${installing}
            @click=${(e: Event) => { e.stopPropagation(); slug && this.installMarketplaceSkill(slug) }}
          >${installing ? 'Installing...' : 'Install'}</button>
        `}
      </div>
    `
  }

  private renderEmpty(message: string) {
    return html`<div style="text-align:center; color:var(--muted); padding:48px; font-size:14px;">${message}</div>`
  }

  // ══════════════════════════════════════
  // LOCAL DETAIL PAGE
  // ══════════════════════════════════════

  private renderLocalDetailPage() {
    const skill = this.selectedSkill!
    const status = this.getStatusInfo(skill)
    const allBins = skill.requirements.bins ?? []
    const allEnv = skill.requirements.env ?? []
    const allConfig = skill.requirements.config ?? []
    const missingBins = new Set(skill.missing.bins ?? [])
    const missingEnv = new Set(skill.missing.env ?? [])
    const missingConfig = new Set(skill.missing.config ?? [])
    const hasRequirements = allBins.length > 0 || allEnv.length > 0 || allConfig.length > 0

    return html`
      <div style="display:flex; flex-direction:column; height:100%; overflow-y:auto;">
        <button
          style="display:flex; align-items:center; gap:6px; padding:10px 16px; border:none; border-bottom:1px solid var(--border); background:transparent; color:var(--muted); cursor:pointer; font-size:14px; transition:color 0.15s;"
          @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-strong)' }}
          @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}
          @click=${() => this.backToList()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to My Skills
        </button>

        <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
          <div style="display:flex; align-items:flex-start; gap:20px;">
            <div style="width:64px; height:64px; border-radius:16px; background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:20px; font-weight:700; color:var(--accent);">
              ${skill.emoji || getSkillAbbr(skill.name)}
            </div>
            <div style="min-width:0; flex:1;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <h1 style="font-size:22px; font-weight:600; color:var(--text-strong); margin:0; letter-spacing:-0.02em;">${skill.name}</h1>
                <span style="display:inline-flex; align-items:center; gap:4px; padding:2px 10px; border-radius:6px; font-size:11px; font-weight:500; border:1px solid ${status.color}30; background:${status.color}10; color:${status.color};">
                  ${status.label}
                </span>
              </div>
              <div style="margin-top:4px; display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:13px; color:var(--muted);">
                <span>source: <span style="font-weight:500; color:var(--text-strong);">${this.getSourceLabel(skill.source)}</span></span>
                <span style="color:var(--border);">\u00B7</span>
                <span style="font-family:var(--font-mono, monospace);">${skill.skillKey}</span>
              </div>
              ${skill.description ? html`
                <p style="margin:8px 0 0; font-size:14px; color:var(--muted); line-height:1.6;">${skill.description}</p>
              ` : nothing}
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <button
              class="btn ${skill.disabled ? '' : 'primary'}"
              style="padding:8px 20px; border-radius:var(--radius-lg); font-size:14px; font-weight:500;"
              ?disabled=${this.togglingSkill}
              @click=${() => this.toggleSkill(skill)}
            >${this.togglingSkill ? '...' : skill.disabled ? 'Enable Skill' : 'Disable Skill'}</button>
            ${this.canUninstallSkill(skill) ? html`
              <button
                class="btn"
                style="padding:8px 20px; border-radius:var(--radius-lg); font-size:14px; font-weight:500; color:var(--danger); border-color:color-mix(in srgb, var(--danger) 45%, var(--border));"
                ?disabled=${this.uninstallingSkill}
                @click=${() => this.uninstallSkill(skill)}
              >${this.uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
            ` : nothing}
            ${skill.homepage ? html`
              <a
                href="${skill.homepage}"
                target="_blank"
                rel="noopener"
                class="btn"
                style="padding:8px 20px; border-radius:var(--radius-lg); font-size:14px; text-decoration:none;"
              >Homepage \u2197</a>
            ` : nothing}
          </div>

          ${hasRequirements ? html`
            <section>
              <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Requirements</h2>
              <div style="display:flex; flex-direction:column; gap:6px; font-size:13px;">
                ${allBins.map(b => html`
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:${missingBins.has(b) ? 'var(--danger)' : 'var(--ok)'}; font-weight:600; width:16px; text-align:center;">
                      ${missingBins.has(b) ? '\u2717' : '\u2713'}
                    </span>
                    <span style="color:var(--muted);">bin:</span>
                    <span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${b}</span>
                  </div>
                `)}
                ${allEnv.map(e => html`
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:${missingEnv.has(e) ? 'var(--danger)' : 'var(--ok)'}; font-weight:600; width:16px; text-align:center;">
                      ${missingEnv.has(e) ? '\u2717' : '\u2713'}
                    </span>
                    <span style="color:var(--muted);">env:</span>
                    <span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${e}</span>
                  </div>
                `)}
                ${allConfig.map(c => html`
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:${missingConfig.has(c) ? 'var(--danger)' : 'var(--ok)'}; font-weight:600; width:16px; text-align:center;">
                      ${missingConfig.has(c) ? '\u2717' : '\u2713'}
                    </span>
                    <span style="color:var(--muted);">config:</span>
                    <span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${c}</span>
                  </div>
                `)}
              </div>
            </section>
          ` : nothing}

          ${skill.install.length > 0 ? html`
            <section>
              <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Install Dependencies</h2>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${skill.install.map(opt => {
                  const key = `${skill.skillKey}:${opt.id}`
                  const installing = this.installingDep[key]
                  const result = this.installResult[key]
                  return html`
                    <div style="display:flex; align-items:center; gap:10px;">
                      <button
                        class="btn"
                        style="padding:6px 16px; border-radius:var(--radius-md); font-size:13px;"
                        ?disabled=${installing}
                        @click=${() => this.installDep(skill, opt)}
                      >${installing ? 'Installing...' : opt.label}</button>
                      ${result ? html`
                        <span style="font-size:12px; color:${result.ok ? 'var(--ok)' : 'var(--danger)'};">${result.message}</span>
                      ` : nothing}
                    </div>
                  `
                })}
              </div>
            </section>
          ` : nothing}

          ${skill.primaryEnv ? html`
            <section>
              <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Configuration</h2>
              <div style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; background:var(--bg);">
                <label style="font-size:13px; font-weight:500; color:var(--text-strong); display:block; margin-bottom:8px;">${skill.primaryEnv}</label>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input
                    type="${this.apiKeyVisible ? 'text' : 'password'}"
                    placeholder="Enter API key..."
                    .value=${this.apiKeyInput}
                    @input=${(e: InputEvent) => { this.apiKeyInput = (e.target as HTMLInputElement).value }}
                    style="flex:1; padding:8px 12px; font-size:13px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg); color:var(--text-strong); outline:none; min-width:0;"
                  />
                  <button
                    class="btn btn--sm"
                    @click=${() => { this.apiKeyVisible = !this.apiKeyVisible }}
                  >${this.apiKeyVisible ? 'Hide' : 'Show'}</button>
                  <button
                    class="btn primary btn--sm"
                    ?disabled=${this.savingApiKey}
                    @click=${() => this.saveApiKey(skill)}
                  >${this.savingApiKey ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </section>
          ` : nothing}

          ${skill.configChecks.length > 0 ? html`
            <section>
              <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Config Checks</h2>
              <div style="display:flex; flex-direction:column; gap:4px; font-size:13px;">
                ${skill.configChecks.map(c => html`
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:${c.satisfied ? 'var(--ok)' : 'var(--danger)'}; font-weight:600; width:16px; text-align:center;">
                      ${c.satisfied ? '\u2713' : '\u2717'}
                    </span>
                    <span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${c.path}</span>
                    ${c.note ? html`<span style="color:var(--muted);">\u2014 ${c.note}</span>` : nothing}
                  </div>
                `)}
              </div>
            </section>
          ` : nothing}
        </div>
      </div>
    `
  }

  // ══════════════════════════════════════
  // MARKETPLACE DETAIL PAGE
  // ══════════════════════════════════════

  private renderMarketplaceDetailPage() {
    if (this.mpDetailLoading) {
      return html`
        <div style="display:flex; flex-direction:column; height:100%;">
          <button
            style="display:flex; align-items:center; gap:6px; padding:10px 16px; border:none; border-bottom:1px solid var(--border); background:transparent; color:var(--muted); cursor:pointer; font-size:14px;"
            @click=${() => this.backToList()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to Marketplace
          </button>
          ${this.renderEmpty('Loading skill details...')}
        </div>
      `
    }

    if (!this.mpDetail) {
      return html`
        <div style="display:flex; flex-direction:column; height:100%;">
          <button
            style="display:flex; align-items:center; gap:6px; padding:10px 16px; border:none; border-bottom:1px solid var(--border); background:transparent; color:var(--muted); cursor:pointer; font-size:14px;"
            @click=${() => this.backToList()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to Marketplace
          </button>
          ${this.renderEmpty('Skill not found')}
        </div>
      `
    }

    const { skill, latestVersion, owner } = this.mpDetail
    const badges = this.getMarketplaceBadges(skill)
    const installing = this.mpInstalling[skill.slug] || this.mpPendingInstall[skill.slug]
    const result = this.mpInstallResult[skill.slug]
    const installed = this.isMarketplaceSkillInstalled(skill.slug) || result?.ok === true
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

    return html`
      <div style="display:flex; flex-direction:column; height:100%; overflow-y:auto;">
        <button
          style="display:flex; align-items:center; gap:6px; padding:10px 16px; border:none; border-bottom:1px solid var(--border); background:transparent; color:var(--muted); cursor:pointer; font-size:14px; transition:color 0.15s;"
          @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-strong)' }}
          @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}
          @click=${() => this.backToList()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Marketplace
        </button>

        <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
          <!-- Header -->
          <div style="display:flex; align-items:flex-start; gap:20px;">
            <div style="width:64px; height:64px; border-radius:16px; background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:20px; font-weight:700; color:var(--accent);">
              ${clawdis?.emoji || getSkillAbbr(skill.displayName)}
            </div>
            <div style="min-width:0; flex:1;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <h1 style="font-size:22px; font-weight:600; color:var(--text-strong); margin:0; letter-spacing:-0.02em;">${skill.displayName}</h1>
                ${badges.map(b => html`
                  <span style="display:inline-flex; padding:2px 10px; border-radius:6px; font-size:11px; font-weight:500; border:1px solid var(--accent)30; background:var(--accent-subtle); color:var(--accent);">
                    ${b}
                  </span>
                `)}
              </div>
              <div style="margin-top:6px; display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:13px; color:var(--muted);">
                ${owner?.handle ? html`
                  <span>by <span style="font-weight:500; color:var(--text-strong);">@${owner.handle || owner.displayName}</span></span>
                  <span style="color:var(--border);">\u00B7</span>
                ` : nothing}
                <span style="font-family:var(--font-mono, monospace);">${skill.slug}</span>
                ${latestVersion ? html`
                  <span style="color:var(--border);">\u00B7</span>
                  <span>v${latestVersion.version}</span>
                ` : nothing}
                ${osLabels.length ? html`
                  <span style="color:var(--border);">\u00B7</span>
                  <span>${osLabels.join(' / ')}</span>
                ` : nothing}
              </div>
              ${skill.summary ? html`
                <p style="margin:8px 0 0; font-size:14px; color:var(--muted); line-height:1.6;">${skill.summary}</p>
              ` : nothing}
              <!-- Inline stats -->
              <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:16px; font-size:13px; color:var(--muted);">
                <span>\u2B07 ${formatNumber(skill.stats.downloads)} downloads</span>
                <span>\u2605 ${formatNumber(skill.stats.stars)} stars</span>
                ${skill.stats.installsCurrent != null ? html`<span>\u229A ${formatNumber(skill.stats.installsCurrent)} active installs</span>` : nothing}
                <span>${skill.stats.versions} versions</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            ${installed ? html`
              <button class="btn" style="padding:8px 20px; border-radius:var(--radius-lg); font-size:14px; font-weight:500; color:var(--ok); border-color:var(--ok);" disabled>
                \u2713 Installed
              </button>
              <button
                class="btn"
                style="padding:8px 20px; border-radius:var(--radius-lg); font-size:14px; font-weight:500; color:var(--danger); border-color:color-mix(in srgb, var(--danger) 45%, var(--border));"
                ?disabled=${this.uninstallingSkill}
                @click=${() => this.uninstallMarketplaceSkill(skill.slug, skill.displayName)}
              >${this.uninstallingSkill ? 'Uninstalling...' : 'Uninstall'}</button>
            ` : html`
              <button
                class="btn primary"
                style="padding:8px 20px; border-radius:var(--radius-lg); font-size:14px; font-weight:500;"
                ?disabled=${installing}
                @click=${() => this.installMarketplaceSkill(skill.slug, latestVersion?.version)}
              >${installing ? 'Installing...' : 'Install Skill'}</button>
            `}
            ${result && !result.ok && !installing ? html`
              <span style="font-size:13px; color:var(--danger);">${result.message}</span>
            ` : nothing}
          </div>


          <!-- Info panels grid -->
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px;">

            <!-- Runtime requirements -->
            ${hasRequirements ? html`
              <section style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; background:var(--card);">
                <h3 style="font-size:14px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Runtime Requirements</h3>
                <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
                  ${osLabels.length ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:60px;">OS</span><span style="color:var(--text-strong);">${osLabels.join(' \u00B7 ')}</span></div>
                  ` : nothing}
                  ${requires?.bins?.length ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:60px;">Bins</span><span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${requires.bins.join(', ')}</span></div>
                  ` : nothing}
                  ${requires?.anyBins?.length ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:60px;">Any bin</span><span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${requires.anyBins.join(', ')}</span></div>
                  ` : nothing}
                  ${requires?.env?.length ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:60px;">Env</span><span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${requires.env.join(', ')}</span></div>
                  ` : nothing}
                  ${requires?.config?.length ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:60px;">Config</span><span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${requires.config.join(', ')}</span></div>
                  ` : nothing}
                  ${clawdis?.primaryEnv ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:60px;">Key</span><span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${clawdis.primaryEnv}</span></div>
                  ` : nothing}
                  ${envVars.length ? html`
                    <div style="border-top:1px solid var(--border); padding-top:8px; margin-top:4px;">
                      <div style="font-size:12px; color:var(--muted); margin-bottom:6px;">Environment Variables</div>
                      ${envVars.map(env => html`
                        <div style="display:flex; align-items:baseline; gap:8px; margin-top:4px;">
                          <code style="font-size:12px; color:var(--text-strong);">${env.name}</code>
                          ${env.required === true ? html`<span style="font-size:10px; color:var(--accent);">required</span>` :
                            env.required === false ? html`<span style="font-size:10px; color:var(--muted);">optional</span>` : nothing}
                          ${env.description ? html`<span style="font-size:12px; color:var(--muted);">\u2014 ${env.description}</span>` : nothing}
                        </div>
                      `)}
                    </div>
                  ` : nothing}
                </div>
              </section>
            ` : nothing}

            <!-- Install specs -->
            ${installSpecs.length ? html`
              <section style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; background:var(--card);">
                <h3 style="font-size:14px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Install Dependencies</h3>
                <div style="display:flex; flex-direction:column; gap:10px; font-size:13px;">
                  ${installSpecs.map(spec => {
                    const cmd = formatInstallCmd(spec)
                    return html`
                      <div>
                        <div style="font-weight:500; color:var(--text-strong);">${spec.label || installKindLabel(spec.kind)}</div>
                        ${spec.bins?.length ? html`<div style="font-size:12px; color:var(--muted);">Bins: ${spec.bins.join(', ')}</div>` : nothing}
                        ${cmd ? html`<code style="display:block; margin-top:4px; padding:6px 10px; border-radius:var(--radius-md); background:var(--bg); font-size:12px; color:var(--text-strong); font-family:var(--font-mono, monospace); user-select:all;">${cmd}</code>` : nothing}
                      </div>
                    `
                  })}
                </div>
              </section>
            ` : nothing}

            <!-- Dependencies -->
            ${deps.length ? html`
              <section style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; background:var(--card);">
                <h3 style="font-size:14px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Dependencies</h3>
                <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
                  ${deps.map(dep => html`
                    <div>
                      <span style="font-weight:500; color:var(--text-strong);">${dep.name}</span>
                      ${dep.type ? html`<span style="color:var(--muted); margin-left:6px;">${dep.type}${dep.version ? ` ${dep.version}` : ''}</span>` : nothing}
                      ${dep.url ? html`<div style="font-size:12px; margin-top:2px;"><a href="${dep.url}" target="_blank" rel="noopener" style="color:var(--accent);">${dep.url}</a></div>` : nothing}
                    </div>
                  `)}
                </div>
              </section>
            ` : nothing}

            <!-- Links -->
            ${links?.homepage || links?.repository || links?.documentation ? html`
              <section style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; background:var(--card);">
                <h3 style="font-size:14px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Links</h3>
                <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
                  ${links.homepage ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:50px;">Home</span><a href="${links.homepage}" target="_blank" rel="noopener" style="color:var(--accent); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${links.homepage}</a></div>
                  ` : nothing}
                  ${links.repository ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:50px;">Repo</span><a href="${links.repository}" target="_blank" rel="noopener" style="color:var(--accent); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${links.repository}</a></div>
                  ` : nothing}
                  ${links.documentation ? html`
                    <div style="display:flex; gap:8px;"><span style="color:var(--muted); min-width:50px;">Docs</span><a href="${links.documentation}" target="_blank" rel="noopener" style="color:var(--accent); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${links.documentation}</a></div>
                  ` : nothing}
                </div>
              </section>
            ` : nothing}
          </div>

          <!-- Latest version -->
          ${latestVersion ? html`
            <section>
              <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Latest Version</h2>
              <div style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; background:var(--bg);">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                  <span style="font-weight:600; color:var(--text-strong);">v${latestVersion.version}</span>
                  <span style="font-size:12px; color:var(--muted);">${timeAgo(latestVersion.createdAt)}</span>
                </div>
                ${latestVersion.changelog ? html`
                  <p style="margin:0; font-size:13px; color:var(--muted); line-height:1.5; white-space:pre-wrap;">${latestVersion.changelog}</p>
                ` : html`
                  <p style="margin:0; font-size:13px; color:var(--muted);">No changelog provided.</p>
                `}
                ${latestVersion.files?.length ? html`
                  <div style="border-top:1px solid var(--border); margin-top:12px; padding-top:12px;">
                    <div style="font-size:12px; color:var(--muted); margin-bottom:6px;">Files (${latestVersion.files.length})</div>
                  </div>
                ` : nothing}
              </div>
            </section>
          ` : nothing}

          <!-- File Browser -->
          ${latestVersion?.files?.length ? html`
            <section>
              <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">Files</h2>
              <div style="display:flex; border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; min-height:300px;">
                <!-- File list -->
                <div style="width:220px; flex-shrink:0; border-right:1px solid var(--border); background:var(--card); overflow-y:auto;">
                  ${latestVersion.files.map(f => html`
                    <button
                      style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:8px 12px; border:none; border-bottom:1px solid var(--border); cursor:pointer; font-size:12px; text-align:left; transition:background 0.1s; ${this.mpSelectedFile === f.path ? 'background:var(--accent-subtle); color:var(--accent);' : 'background:transparent; color:var(--text);'}"
                      @mouseenter=${(e: MouseEvent) => { if (this.mpSelectedFile !== f.path) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                      @mouseleave=${(e: MouseEvent) => { if (this.mpSelectedFile !== f.path) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      @click=${() => this.selectFile(f.path)}
                    >
                      <span style="font-family:var(--font-mono, monospace); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.path}</span>
                      ${f.size != null ? html`<span style="font-size:10px; color:var(--muted); flex-shrink:0; margin-left:8px;">${formatBytes(f.size)}</span>` : nothing}
                    </button>
                  `)}
                </div>
                <!-- File viewer -->
                <div style="flex:1; min-width:0; display:flex; flex-direction:column; background:var(--bg);">
                  <div style="padding:8px 12px; border-bottom:1px solid var(--border); font-size:12px; display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-family:var(--font-mono, monospace); color:var(--text-strong);">${this.mpSelectedFile ?? 'Select a file'}</span>
                  </div>
                  <div style="flex:1; overflow:auto; padding:12px;">
                    ${this.mpFileLoading ? html`
                      <div style="color:var(--muted); font-size:13px;">Loading...</div>
                    ` : this.mpFileError ? html`
                      <div style="color:var(--danger); font-size:13px;">${this.mpFileError}</div>
                    ` : this.mpFileContent != null ? html`
                      <pre style="margin:0; font-size:12px; line-height:1.6; color:var(--text); font-family:var(--font-mono, monospace); white-space:pre-wrap; word-break:break-word;">${this.mpFileContent}</pre>
                    ` : html`
                      <div style="color:var(--muted); font-size:13px;">Select a file to preview.</div>
                    `}
                  </div>
                </div>
              </div>
            </section>
          ` : nothing}

          <!-- SKILL.md -->
          ${this.mpReadmeLoading ? html`
            <section>
              <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">SKILL.md</h2>
              <div style="text-align:center; color:var(--muted); padding:24px; font-size:13px;">Loading...</div>
            </section>
          ` : this.mpReadme ? html`
            <section>
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0;">SKILL.md</h2>
                <div style="display:flex; border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden;">
                  <button
                    style="padding:4px 12px; font-size:12px; border:none; cursor:pointer; transition:all 0.1s; ${!this.mpReadmeRaw ? 'background:var(--accent-subtle); color:var(--accent);' : 'background:transparent; color:var(--muted);'}"
                    @click=${() => { this.mpReadmeRaw = false }}
                  >Rendered</button>
                  <button
                    style="padding:4px 12px; font-size:12px; border:none; border-left:1px solid var(--border); cursor:pointer; transition:all 0.1s; ${this.mpReadmeRaw ? 'background:var(--accent-subtle); color:var(--accent);' : 'background:transparent; color:var(--muted);'}"
                    @click=${() => { this.mpReadmeRaw = true }}
                  >Source</button>
                </div>
              </div>
              ${this.mpReadmeRaw ? html`
                <div style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; background:var(--bg); font-size:13px; line-height:1.7; color:var(--text); white-space:pre-wrap; word-break:break-word; overflow-x:auto; font-family:var(--font-mono, monospace);">${this.mpReadme}</div>
              ` : html`
                <div class="markdown-body" style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; background:var(--bg); font-size:14px; line-height:1.7; color:var(--text); overflow-x:auto;">${unsafeHTML(renderMarkdown(this.mpReadme))}</div>
              `}
            </section>
          ` : nothing}

          <!-- Timeline -->
          <section style="font-size:13px; color:var(--muted); display:flex; gap:16px;">
            <span>Created ${new Date(skill.createdAt).toLocaleDateString()}</span>
            <span>\u00B7</span>
            <span>Updated ${new Date(skill.updatedAt).toLocaleDateString()}</span>
          </section>
        </div>
      </div>
    `
  }

}
