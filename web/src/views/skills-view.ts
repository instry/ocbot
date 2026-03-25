import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import {
  listMarketplaceSkills,
  searchMarketplaceSkills,
  getMarketplaceSkillDetail,
  type MarketplaceSkill,
  type MarketplaceSearchResult,
  type MarketplaceSkillDetail,
} from '../lib/clawhub-client'

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

type Tab = 'local' | 'clawhub'
type View = 'list' | 'local-detail' | 'hub-detail'
type LocalSort = 'name' | 'source' | 'status'
type HubSort = 'newest' | 'updated' | 'name' | 'stars' | 'installs'
type DisplayMode = 'cards' | 'list'

const LOAD_BATCH = 30

const LOCAL_SORT_OPTIONS: Array<{ value: LocalSort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'source', label: 'Source' },
]

const HUB_SORT_OPTIONS: Array<{ value: HubSort; label: string }> = [
  { value: 'installs', label: 'Most installed' },
  { value: 'stars', label: 'Most starred' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name' },
]

function getSkillAbbr(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
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
  @state() private hubSort: HubSort = 'installs'
  @state() private sortDropdownOpen = false
  @state() private displayMode: DisplayMode = 'cards'
  @state() private localVisible = LOAD_BATCH
  @state() private hubVisible = LOAD_BATCH
  private searchTimer: ReturnType<typeof setTimeout> | null = null
  private scrollHandler: (() => void) | null = null

  // ── Local skills state ──
  @state() private localSkills: SkillStatusEntry[] = []
  @state() private localLoading = true
  @state() private localError: string | null = null
  @state() private selectedSkill: SkillStatusEntry | null = null
  @state() private apiKeyInput = ''
  @state() private apiKeyVisible = false
  @state() private savingApiKey = false
  @state() private togglingSkill = false
  @state() private installingDep: Record<string, boolean> = {}
  @state() private installResult: Record<string, { ok: boolean; message: string }> = {}

  // ── Marketplace state ──
  @state() private hubSkills: MarketplaceSkill[] = []
  @state() private hubSearchResults: MarketplaceSearchResult[] = []
  @state() private hubLoading = false
  @state() private hubError: string | null = null
  @state() private hubLoaded = false
  @state() private hubTotal: number | null = null
  @state() private selectedHubSlug: string | null = null
  @state() private hubDetail: MarketplaceSkillDetail | null = null
  @state() private hubDetailLoading = false
  @state() private installingHub = false
  @state() private hubInstallResult: { ok: boolean; message: string } | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.loadLocalSkills()
    this.fetchHubTotal()
  }

  // ── Data loading ──

  private async loadLocalSkills() {
    this.localLoading = true
    this.localError = null
    try {
      const result = await this.gateway.call<SkillStatusReport>('skills.status')
      this.localSkills = result?.skills ?? []
    } catch (err) {
      this.localError = err instanceof Error ? err.message : String(err)
    } finally {
      this.localLoading = false
    }
  }

  /** Fetch hub total count on page load. Only use if API returns total explicitly. */
  private async fetchHubTotal() {
    try {
      const resp = await listMarketplaceSkills(1, 0)
      if (resp.total != null) this.hubTotal = resp.total
    } catch { /* ignore */ }
  }

  /** Load all marketplace skills by paginating through all pages. */
  private async loadHubSkills() {
    if (this.hubLoaded) return
    this.hubLoading = true
    this.hubError = null
    try {
      const all: MarketplaceSkill[] = []
      const PAGE = 200
      let offset = 0
      let total: number | undefined
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const resp = await listMarketplaceSkills(PAGE, offset)
        if (resp.total != null) total = resp.total
        all.push(...resp.items)
        if (resp.items.length < PAGE) break   // last page
        offset += resp.items.length
        if (total != null && all.length >= total) break
      }
      this.hubSkills = all
      if (total != null) this.hubTotal = total
      this.hubLoaded = true
    } catch (err) {
      this.hubError = err instanceof Error ? err.message : String(err)
    } finally {
      this.hubLoading = false
    }
  }

  private async searchHub(query: string) {
    this.hubLoading = true
    try {
      const resp = await searchMarketplaceSkills(query)
      this.hubSearchResults = resp.results
    } catch {
      this.hubSearchResults = []
    } finally {
      this.hubLoading = false
    }
  }

  private async loadHubDetail(name: string) {
    this.selectedHubSlug = name
    this.hubDetail = null
    this.hubDetailLoading = true
    this.hubInstallResult = null
    try {
      this.hubDetail = await getMarketplaceSkillDetail(name)
    } finally {
      this.hubDetailLoading = false
    }
  }

  // ── Actions ──

  private async toggleSkill(skill: SkillStatusEntry) {
    this.togglingSkill = true
    try {
      await this.gateway.call('skills.update', { skillKey: skill.skillKey, enabled: skill.disabled })
      await this.loadLocalSkills()
      // Update selected skill reference
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

  private async installFromHub(slug: string) {
    this.installingHub = true
    this.hubInstallResult = null
    try {
      const result = await this.gateway.call<{ ok: boolean; message?: string }>(
        'skills.install',
        { source: 'clawhub', slug },
      )
      this.hubInstallResult = {
        ok: result?.ok !== false,
        message: result?.ok !== false ? 'Installed successfully' : (result?.message ?? 'Install failed'),
      }
      if (result?.ok !== false) await this.loadLocalSkills()
    } catch (err) {
      this.hubInstallResult = { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      this.installingHub = false
    }
  }

  private async updateFromHub(slug: string) {
    this.installingHub = true
    this.hubInstallResult = null
    try {
      await this.gateway.call('skills.update', { source: 'clawhub', slug })
      this.hubInstallResult = { ok: true, message: 'Updated successfully' }
      await this.loadLocalSkills()
    } catch (err) {
      this.hubInstallResult = { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      this.installingHub = false
    }
  }

  // ── Navigation ──

  private openLocalDetail(skill: SkillStatusEntry) {
    this.selectedSkill = skill
    this.apiKeyInput = ''
    this.apiKeyVisible = false
    this.installResult = {}
    this.view = 'local-detail'
  }

  private openHubDetail(slug: string) {
    this.loadHubDetail(slug)
    this.view = 'hub-detail'
  }

  private backToList() {
    this.view = 'list'
    this.selectedSkill = null
    this.selectedHubSlug = null
    this.hubDetail = null
  }

  // ── Search ──

  private onSearchInput(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value
    this.searchQuery = value
    this.localVisible = LOAD_BATCH
    this.hubVisible = LOAD_BATCH
    if (this.searchTimer) clearTimeout(this.searchTimer)
    if (this.tab === 'clawhub') {
      this.searchTimer = setTimeout(() => {
        if (value.trim()) this.searchHub(value)
        else this.hubSearchResults = []
      }, 300)
    }
  }

  private switchTab(tab: Tab) {
    this.tab = tab
    this.view = 'list'
    this.localVisible = LOAD_BATCH
    this.hubVisible = LOAD_BATCH
    this.selectedSkill = null
    this.selectedHubSlug = null
    if (tab === 'clawhub' && !this.hubLoaded) this.loadHubSkills()
  }

  // ── Helpers ──

  private onListScroll(e: Event) {
    const el = e.target as HTMLElement
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      if (this.tab === 'local') {
        const total = this.getFilteredLocalSkills().length
        if (this.localVisible < total) this.localVisible += LOAD_BATCH
      } else {
        const isSearching = this.searchQuery.trim().length > 0
        const total = isSearching ? this.hubSearchResults.length : this.hubSkills.length
        if (this.hubVisible < total) this.hubVisible += LOAD_BATCH
      }
    }
  }

  private isInstalled(slug: string): boolean {
    return this.localSkills.some(s => s.skillKey === slug || s.name === slug)
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

  private getSortedHubSkills(): MarketplaceSkill[] {
    const items = [...this.hubSkills]
    switch (this.hubSort) {
      case 'newest':
        items.sort((a, b) => b.createdAt - a.createdAt)
        break
      case 'updated':
        items.sort((a, b) => b.updatedAt - a.updatedAt)
        break
      case 'name':
        items.sort((a, b) => a.displayName.localeCompare(b.displayName))
        break
      case 'stars':
        items.sort((a, b) => (b.starCount ?? 0) - (a.starCount ?? 0))
        break
      case 'installs':
        items.sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0))
        break
    }
    return items
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

  private formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  private formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
  }

  // ── Render ──

  override render() {
    if (this.view === 'local-detail' && this.selectedSkill) return this.renderLocalDetailPage()
    if (this.view === 'hub-detail') return this.renderHubDetailPage()
    return this.renderListPage()
  }

  // ══════════════════════════════════════
  // LIST PAGE
  // ══════════════════════════════════════

  private renderListPage() {
    return html`
      <div
        style="display:flex; flex-direction:column; height:100%; overflow-y:scroll; padding:24px;"
        @scroll=${this.onListScroll}
      >
        <!-- Title -->
        <h1 style="font-size:22px; font-weight:600; letter-spacing:-0.02em; color:var(--text-strong); margin:0;">Skills</h1>
        <p style="font-size:14px; color:var(--muted); margin:4px 0 0;">Browse and manage your AI skills</p>

        <!-- Tabs (underline style) -->
        <div style="display:flex; gap:16px; border-bottom:1px solid var(--border); margin-top:16px;">
          ${this.renderTabBtn('local', `My Skills (${this.localSkills.length})`)}
          ${this.renderTabBtn('clawhub', `Marketplace${this.hubTotal != null ? ` (${this.hubTotal})` : ''}`)}
        </div>

        <!-- Search + Sort -->
        ${(this.tab === 'clawhub' || this.localSkills.length > 0) ? html`
          <div style="display:flex; align-items:center; gap:10px; margin-top:16px;">
            <div style="position:relative; max-width:400px; flex:1;">
              <svg style="position:absolute; left:12px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--muted); pointer-events:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search skills..."
                .value=${this.searchQuery}
                @input=${this.onSearchInput}
                style="width:100%; padding:10px 16px 10px 36px; font-size:14px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg); color:var(--text-strong); outline:none; transition:border-color 0.15s;"
              />
            </div>
            ${this.renderSortDropdown()}
            ${this.renderViewToggle()}
          </div>
        ` : nothing}

        <!-- Content -->
        <div style="flex:1; margin-top:12px;">
          ${this.tab === 'local' ? this.renderLocalGrid() : this.renderHubGrid()}
        </div>
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
    const options = this.tab === 'local' ? LOCAL_SORT_OPTIONS : HUB_SORT_OPTIONS
    const current = this.tab === 'local' ? this.localSort : this.hubSort
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
                  if (this.tab === 'local') this.localSort = opt.value as LocalSort
                  else this.hubSort = opt.value as HubSort
                  this.sortDropdownOpen = false
                  this.localVisible = LOAD_BATCH
                  this.hubVisible = LOAD_BATCH
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

  // ── Local Grid ──

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
    return html`
      <div
        style="display:flex; flex-direction:column; min-width:0; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; background:var(--card); cursor:pointer; transition:all 0.15s; box-shadow:var(--shadow-sm, none);"
        @click=${() => this.openLocalDetail(skill)}
        @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong, var(--border))' }}
        @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm, none)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      >
        <div style="display:flex; align-items:flex-start; gap:14px;">
          <!-- Icon -->
          <div style="width:48px; height:48px; border-radius:var(--radius-lg); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:14px; font-weight:600; color:var(--accent);">
            ${skill.emoji || getSkillAbbr(skill.name)}
          </div>
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:15px; font-weight:600; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; letter-spacing:-0.02em;">
                ${skill.name}
              </span>
              <!-- Status badge -->
              <span style="display:inline-flex; align-items:center; gap:4px; padding:1px 8px; border-radius:6px; font-size:10px; font-weight:500; flex-shrink:0; border:1px solid ${status.color}30; background:${status.color}10; color:${status.color};">
                ${status.label}
              </span>
            </div>
            <!-- Source tag -->
            <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">
              <span style="padding:1px 8px; border-radius:6px; border:1px solid var(--border); font-size:10px; color:var(--muted);">
                ${this.getSourceLabel(skill.source)}
              </span>
            </div>
          </div>
        </div>
        <!-- Description -->
        <p style="margin:12px 0 0; font-size:13px; color:var(--muted); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; flex:1;">
          ${skill.description || 'No description'}
        </p>
        <!-- Footer -->
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--border); margin-top:12px; padding-top:12px; font-size:12px; color:var(--muted);">
          <span style="font-family:var(--font-mono, monospace);">${skill.skillKey}</span>
          ${skill.homepage ? html`<span>\u2197</span>` : nothing}
        </div>
      </div>
    `
  }

  private renderLocalListRow(skill: SkillStatusEntry) {
    const status = this.getStatusInfo(skill)
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
      </div>
    `
  }

  // ── Hub Grid ──

  private renderHubGrid() {
    if (this.hubLoading && !this.hubLoaded) return this.renderEmpty('Loading marketplace...')
    if (this.hubError) return html`<div style="text-align:center; color:var(--danger); padding:48px;">${this.hubError}</div>`

    const isSearching = this.searchQuery.trim().length > 0
    // Browse returns MarketplaceSkill[], search returns MarketplaceSearchResult[] — normalize to MarketplaceSkill[]
    const skills: MarketplaceSkill[] = isSearching
      ? this.hubSearchResults.map(r => r.package)
      : this.getSortedHubSkills()

    if (this.hubLoading) return this.renderEmpty('Searching...')
    if (skills.length === 0) return this.renderEmpty(isSearching ? 'No matching skills' : 'No skills available')

    const visible = skills.slice(0, this.hubVisible)

    return html`
      ${this.displayMode === 'cards' ? html`
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${visible.map(s => this.renderHubCard(s))}
        </div>
      ` : html`
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${visible.map(s => this.renderHubListRow(s))}
        </div>
      `}
      ${visible.length < skills.length ? html`
        <div style="text-align:center; color:var(--muted); padding:16px; font-size:13px;">Loading more...</div>
      ` : nothing}
    `
  }

  private renderHubCard(pkg: MarketplaceSkill) {
    const installed = this.isInstalled(pkg.name)
    return html`
      <div
        style="display:flex; flex-direction:column; min-width:0; overflow:hidden; border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; background:var(--card); cursor:pointer; transition:all 0.15s; box-shadow:var(--shadow-sm, none);"
        @click=${() => this.openHubDetail(pkg.name)}
        @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong, var(--border))' }}
        @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm, none)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      >
        <div style="display:flex; align-items:flex-start; gap:14px; min-width:0;">
          <!-- Icon / Owner avatar -->
          ${pkg.ownerImage ? html`
            <img src="${pkg.ownerImage}" alt="" style="width:48px; height:48px; border-radius:var(--radius-lg); object-fit:cover; flex-shrink:0;" />
          ` : html`
            <div style="width:48px; height:48px; border-radius:var(--radius-lg); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:14px; font-weight:600; color:var(--accent);">
              ${getSkillAbbr(pkg.displayName)}
            </div>
          `}
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:15px; font-weight:600; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; letter-spacing:-0.02em;">
                ${pkg.displayName}
              </span>
              ${installed ? html`
                <span style="display:inline-flex; align-items:center; padding:1px 8px; border-radius:6px; font-size:10px; font-weight:500; flex-shrink:0; border:1px solid var(--ok); background:rgba(34,197,94,0.1); color:var(--ok);">
                  Installed
                </span>
              ` : nothing}
            </div>
            <!-- Stats row -->
            <div style="display:flex; align-items:center; gap:10px; margin-top:4px; font-size:12px; color:var(--muted);">
              ${pkg.starCount != null ? html`
                <span style="display:flex; align-items:center; gap:3px;" title="Stars">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  ${this.formatCount(pkg.starCount)}
                </span>
              ` : nothing}
              ${pkg.installCount != null ? html`
                <span style="display:flex; align-items:center; gap:3px;" title="Installs">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  ${this.formatCount(pkg.installCount)}
                </span>
              ` : nothing}
            </div>
          </div>
        </div>
        <!-- Description -->
        <p style="margin:12px 0 0; font-size:13px; color:var(--muted); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; flex:1;">
          ${pkg.summary || 'No description'}
        </p>
        <!-- Footer: version left, author right -->
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; border-top:1px solid var(--border); margin-top:12px; padding-top:12px; font-size:12px; color:var(--muted); min-width:0;">
          <span style="font-family:var(--font-mono, monospace); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex-shrink:1;">${pkg.latestVersion ? `v${pkg.latestVersion}` : pkg.name}</span>
          ${pkg.ownerHandle || pkg.ownerDisplayName ? html`
            <span style="display:flex; align-items:center; gap:5px; overflow:hidden; flex-shrink:0; max-width:50%;">
              ${pkg.ownerImage ? html`
                <img src="${pkg.ownerImage}" alt="" style="width:16px; height:16px; border-radius:50%; object-fit:cover; flex-shrink:0;" />
              ` : html`
                <div style="width:16px; height:16px; border-radius:50%; background:var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              `}
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pkg.ownerDisplayName || pkg.ownerHandle}</span>
            </span>
          ` : nothing}
        </div>
      </div>
    `
  }

  private renderHubListRow(pkg: MarketplaceSkill) {
    const installed = this.isInstalled(pkg.name)
    return html`
      <div
        class="session-card"
        style="display:flex; align-items:center; gap:12px; cursor:pointer;"
        @click=${() => this.openHubDetail(pkg.name)}
      >
        ${pkg.ownerImage ? html`
          <img src="${pkg.ownerImage}" alt="" style="width:36px; height:36px; border-radius:var(--radius-md); object-fit:cover; flex-shrink:0;" />
        ` : html`
          <div style="width:36px; height:36px; border-radius:var(--radius-md); background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:12px; font-weight:600; color:var(--accent);">
            ${getSkillAbbr(pkg.displayName)}
          </div>
        `}
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:14px; font-weight:500; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pkg.displayName}</span>
            ${installed ? html`
              <span style="padding:1px 6px; border-radius:4px; font-size:10px; font-weight:500; border:1px solid var(--ok); background:rgba(34,197,94,0.1); color:var(--ok); flex-shrink:0;">Installed</span>
            ` : nothing}
          </div>
          ${pkg.summary ? html`
            <div style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px;">${pkg.summary}</div>
          ` : nothing}
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-shrink:0; font-size:12px; color:var(--muted);">
          ${pkg.starCount != null ? html`
            <span style="display:flex; align-items:center; gap:3px;" title="Stars">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              ${this.formatCount(pkg.starCount)}
            </span>
          ` : nothing}
          ${pkg.installCount != null ? html`
            <span style="display:flex; align-items:center; gap:3px;" title="Installs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              ${this.formatCount(pkg.installCount)}
            </span>
          ` : nothing}
          ${pkg.latestVersion ? html`
            <span style="font-size:11px; font-family:var(--font-mono, monospace);">v${pkg.latestVersion}</span>
          ` : nothing}
          ${pkg.ownerHandle || pkg.ownerDisplayName ? html`
            <span style="display:flex; align-items:center; gap:4px; margin-left:2px;">
              ${pkg.ownerImage ? html`
                <img src="${pkg.ownerImage}" alt="" style="width:16px; height:16px; border-radius:50%; object-fit:cover; flex-shrink:0;" />
              ` : html`
                <div style="width:16px; height:16px; border-radius:50%; background:var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
              `}
              <span style="max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pkg.ownerDisplayName || pkg.ownerHandle}</span>
            </span>
          ` : nothing}
        </div>
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
        <!-- Back button -->
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
          <!-- Header -->
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

          <!-- Action buttons -->
          <div style="display:flex; align-items:center; gap:12px;">
            <button
              class="btn ${skill.disabled ? '' : 'primary'}"
              style="padding:8px 20px; border-radius:var(--radius-lg); font-size:14px; font-weight:500;"
              ?disabled=${this.togglingSkill}
              @click=${() => this.toggleSkill(skill)}
            >${this.togglingSkill ? '...' : skill.disabled ? 'Enable Skill' : 'Disable Skill'}</button>
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

          <!-- Requirements section -->
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

          <!-- Install deps -->
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

          <!-- Configuration (API key) -->
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

          <!-- Config checks -->
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
  // HUB DETAIL PAGE
  // ══════════════════════════════════════

  private renderHubDetailPage() {
    return html`
      <div style="display:flex; flex-direction:column; height:100%; overflow-y:auto;">
        <!-- Back button -->
        <button
          style="display:flex; align-items:center; gap:6px; padding:10px 16px; border:none; border-bottom:1px solid var(--border); background:transparent; color:var(--muted); cursor:pointer; font-size:14px; transition:color 0.15s;"
          @mouseenter=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-strong)' }}
          @mouseleave=${(e: MouseEvent) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}
          @click=${() => this.backToList()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Marketplace
        </button>

        ${this.hubDetailLoading ? html`
          <div style="text-align:center; color:var(--muted); padding:48px;">Loading...</div>
        ` : !this.hubDetail?.package ? html`
          <div style="text-align:center; color:var(--muted); padding:48px;">Could not load skill detail</div>
        ` : this.renderHubDetailContent()}
      </div>
    `
  }

  private renderHubDetailContent() {
    const detail = this.hubDetail!
    const pkg = detail.package!
    const slug = this.selectedHubSlug!
    const installed = this.isInstalled(slug)
    const owner = detail.owner
    const compatibility = pkg.compatibility
    const capabilities = pkg.capabilities
    const verification = pkg.verification

    return html`
      <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
        <!-- Header -->
        <div style="display:flex; align-items:flex-start; gap:20px;">
          <div style="width:64px; height:64px; border-radius:16px; background:var(--accent-subtle); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:20px; font-weight:700; color:var(--accent);">
            ${getSkillAbbr(pkg.displayName)}
          </div>
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <h1 style="font-size:22px; font-weight:600; color:var(--text-strong); margin:0; letter-spacing:-0.02em;">${pkg.displayName}</h1>
              ${installed ? html`
                <span style="display:inline-flex; align-items:center; padding:2px 10px; border-radius:6px; font-size:11px; font-weight:500; border:1px solid var(--ok); background:rgba(34,197,94,0.1); color:var(--ok);">Installed</span>
              ` : nothing}
            </div>
            <!-- Author row -->
            <div style="margin-top:6px; display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:13px; color:var(--muted);">
              ${owner?.handle || owner?.displayName ? html`
                <span style="display:flex; align-items:center; gap:5px;">
                  ${owner.image ? html`
                    <img src="${owner.image}" alt="" style="width:20px; height:20px; border-radius:50%; object-fit:cover;" />
                  ` : html`
                    <div style="width:20px; height:20px; border-radius:50%; background:var(--border); display:flex; align-items:center; justify-content:center;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                  `}
                  <span style="font-weight:500; color:var(--text-strong);">${owner.displayName || owner.handle}</span>
                </span>
              ` : nothing}
              ${pkg.latestVersion ? html`
                <span style="color:var(--border);">\u00B7</span>
                <span style="font-family:var(--font-mono, monospace);">${pkg.latestVersion}</span>
              ` : nothing}
            </div>
            <!-- Stats row -->
            <div style="margin-top:8px; display:flex; align-items:center; gap:14px; font-size:13px; color:var(--muted);">
              ${pkg.starCount != null ? html`
                <span style="display:flex; align-items:center; gap:4px;" title="Stars">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  ${this.formatCount(pkg.starCount)} stars
                </span>
              ` : nothing}
              ${pkg.installCount != null ? html`
                <span style="display:flex; align-items:center; gap:4px;" title="Installs">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  ${this.formatCount(pkg.installCount)} installs
                </span>
              ` : nothing}
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div style="display:flex; align-items:center; gap:12px;">
          <button
            class="btn primary"
            style="padding:8px 20px; border-radius:var(--radius-lg); font-size:14px; font-weight:500;"
            ?disabled=${this.installingHub}
            @click=${() => installed ? this.updateFromHub(slug) : this.installFromHub(slug)}
          >${this.installingHub ? 'Installing...' : installed ? 'Update' : 'Install'}</button>
          ${this.hubInstallResult ? html`
            <span style="font-size:13px; color:${this.hubInstallResult.ok ? 'var(--ok)' : 'var(--danger)'};">${this.hubInstallResult.message}</span>
          ` : nothing}
        </div>

        <!-- About -->
        ${pkg.summary ? html`
          <section>
            <h2 style="font-size:16px; font-weight:600; color:var(--text-strong); margin:0 0 12px;">About</h2>
            <p style="font-size:14px; color:var(--muted); line-height:1.6; margin:0;">${pkg.summary}</p>
          </section>
        ` : nothing}

        <!-- Metadata -->
        ${compatibility || capabilities || pkg.tags ? html`
          <div style="border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; background:var(--bg); display:flex; flex-direction:column; gap:8px;">
            ${capabilities?.hostTargets && capabilities.hostTargets.length > 0 ? html`
              <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
                <span style="color:var(--muted); font-weight:500; flex-shrink:0;">Platforms</span>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                  ${capabilities.hostTargets.map(t => html`<span style="padding:2px 8px; border-radius:6px; border:1px solid var(--border); font-size:12px; color:var(--text-strong);">${t}</span>`)}
                </div>
              </div>
            ` : nothing}
            ${capabilities?.capabilityTags && capabilities.capabilityTags.length > 0 ? html`
              <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
                <span style="color:var(--muted); font-weight:500; flex-shrink:0;">Capabilities</span>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                  ${capabilities.capabilityTags.map(t => html`<span style="padding:2px 8px; border-radius:6px; border:1px solid var(--border); font-size:12px; color:var(--text-strong);">${t}</span>`)}
                </div>
              </div>
            ` : nothing}
            ${pkg.tags && Object.keys(pkg.tags).length > 0 ? html`
              <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
                <span style="color:var(--muted); font-weight:500; flex-shrink:0;">Tags</span>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                  ${Object.entries(pkg.tags).map(([k, v]) => html`<span style="padding:2px 8px; border-radius:6px; border:1px solid var(--border); font-size:12px; color:var(--text-strong);">${k}: ${v}</span>`)}
                </div>
              </div>
            ` : nothing}
            ${verification?.tier ? html`
              <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
                <span style="color:var(--muted); font-weight:500; flex-shrink:0;">Verification</span>
                <span style="padding:2px 8px; border-radius:6px; border:1px solid var(--ok); background:rgba(34,197,94,0.1); font-size:12px; color:var(--ok);">${verification.tier}</span>
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `
  }
}
