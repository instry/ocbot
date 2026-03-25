import { LitElement, html, nothing } from 'lit'
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

interface MarketplaceThemePayload {
  mode: 'light' | 'dark'
  accent: string
  accentForeground: string
  accentSubtle: string
  bg: string
  bgHover: string
  bgElevated: string
  card: string
  text: string
  textStrong: string
  muted: string
  border: string
  borderStrong: string
  radius: string
  radiusMd: string
  fontBody: string
  shadow: string
}

type Tab = 'local' | 'clawhub'
type View = 'list' | 'local-detail'
type LocalSort = 'name' | 'source' | 'status'
type DisplayMode = 'cards' | 'list'

const LOAD_BATCH = 30
const CLAWHUB_URL = 'https://clawhub.ai/skills'
const CLAWHUB_ORIGIN = 'https://clawhub.ai'

const LOCAL_SORT_OPTIONS: Array<{ value: LocalSort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'source', label: 'Source' },
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
  @state() private sortDropdownOpen = false
  @state() private displayMode: DisplayMode = 'cards'
  @state() private localVisible = LOAD_BATCH
  private searchTimer: ReturnType<typeof setTimeout> | null = null

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
  @state() private marketplaceLoading = true
  @state() private marketplaceReady = false

  private _iframeMessageHandler: ((e: MessageEvent) => void) | null = null
  private _themeObserver: MutationObserver | null = null

  override connectedCallback() {
    super.connectedCallback()
    // Ensure custom element fills parent flex container
    this.style.display = 'flex'
    this.style.flexDirection = 'column'
    this.style.flex = '1'
    this.style.minHeight = '0'
    this.loadLocalSkills()
    // Listen for install requests from embedded ClawHub iframe
    this._iframeMessageHandler = this.handleIframeMessage.bind(this)
    window.addEventListener('message', this._iframeMessageHandler)
    this._themeObserver = new MutationObserver(() => this.syncMarketplaceTheme())
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme-mode'],
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    if (this._iframeMessageHandler) {
      window.removeEventListener('message', this._iframeMessageHandler)
    }
    this._themeObserver?.disconnect()
  }

  private async handleIframeMessage(e: MessageEvent) {
    const iframe = this.getMarketplaceIframe()
    if (!iframe?.contentWindow || e.source !== iframe.contentWindow) return
    if (!this.isTrustedMarketplaceOrigin(e.origin)) return

    if (e.data?.type === 'ocbot:clawhub:ready') {
      this.marketplaceLoading = false
      this.marketplaceReady = true
      this.syncMarketplaceTheme()
      return
    }

    if (e.data?.type !== 'ocbot:clawhub:install') return

    const slug = e.data.slug as string
    const requestId = e.data.requestId as string | undefined
    if (!slug) return

    let ok = false
    let message = ''
    try {
      const result = await this.gateway.call<{ ok: boolean; message?: string }>(
        'skills.install',
        { source: 'clawhub', slug },
      )
      ok = result?.ok !== false
      message = ok ? 'Installed' : (result?.message ?? 'Failed')
      if (ok) await this.loadLocalSkills()
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }

    iframe?.contentWindow?.postMessage(
      { type: 'ocbot:clawhub:install:result', slug, requestId, ok, message },
      e.origin || CLAWHUB_ORIGIN
    )
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


  // ── Navigation ──

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
  }

  // ── Search ──

  private onSearchInput(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value
    this.searchQuery = value
    this.localVisible = LOAD_BATCH
    if (this.searchTimer) clearTimeout(this.searchTimer)
  }

  private switchTab(tab: Tab) {
    this.tab = tab
    this.view = 'list'
    this.localVisible = LOAD_BATCH
    this.selectedSkill = null
    if (tab === 'clawhub') {
      this.marketplaceLoading = true
      this.marketplaceReady = false
    }
  }

  private getMarketplaceIframe() {
    return this.querySelector('iframe')
  }

  private isTrustedMarketplaceOrigin(origin: string) {
    try {
      const { hostname, protocol } = new URL(origin)
      return protocol === 'https:' && (hostname === 'clawhub.ai' || hostname.endsWith('.clawhub.ai'))
    } catch {
      return false
    }
  }

  private getMarketplaceTheme(): MarketplaceThemePayload {
    const root = document.documentElement
    const style = getComputedStyle(root)
    const resolve = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const attrMode = root.getAttribute('data-theme-mode')
    const mode = attrMode === 'light' || attrMode === 'dark'
      ? attrMode
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

    return {
      mode,
      accent: resolve('--accent', '#7c3aed'),
      accentForeground: resolve('--accent-foreground', '#ffffff'),
      accentSubtle: resolve('--accent-subtle', 'rgba(124, 58, 237, 0.14)'),
      bg: resolve('--bg', '#0b0d12'),
      bgHover: resolve('--bg-hover', 'rgba(148, 163, 184, 0.08)'),
      bgElevated: resolve('--bg-elevated', resolve('--card', '#11151c')),
      card: resolve('--card', resolve('--bg-elevated', '#11151c')),
      text: resolve('--text', '#e5e7eb'),
      textStrong: resolve('--text-strong', resolve('--text', '#f8fafc')),
      muted: resolve('--muted', '#94a3b8'),
      border: resolve('--border', 'rgba(255, 255, 255, 0.08)'),
      borderStrong: resolve('--border-strong', resolve('--border', 'rgba(255, 255, 255, 0.12)')),
      radius: resolve('--radius-lg', '14px'),
      radiusMd: resolve('--radius-md', '10px'),
      fontBody: resolve('--font-body', 'Inter, system-ui, sans-serif'),
      shadow: resolve('--shadow-sm', '0 12px 32px rgba(0, 0, 0, 0.18)'),
    }
  }

  private syncMarketplaceTheme() {
    if (!this.marketplaceReady) return
    this.postMarketplaceMessage({
      type: 'ocbot:theme-sync',
      theme: this.getMarketplaceTheme(),
    })
  }

  private postMarketplaceMessage(message: unknown) {
    const iframe = this.getMarketplaceIframe()
    iframe?.contentWindow?.postMessage(message, CLAWHUB_ORIGIN)
  }

  private handleMarketplaceLoad() {
    this.syncMarketplaceTheme()
    window.setTimeout(() => {
      if (!this.marketplaceReady && this.tab === 'clawhub') {
        this.marketplaceLoading = false
      }
    }, 1200)
  }

  // ── Helpers ──

  private onListScroll(e: Event) {
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


  // ── Render ──

  override render() {
    if (this.view === 'local-detail' && this.selectedSkill) return this.renderLocalDetailPage()
    return this.renderListPage()
  }

  // ══════════════════════════════════════
  // LIST PAGE
  // ══════════════════════════════════════

  private renderListPage() {
    return html`
      <div
        style="display:flex; flex-direction:column; height:100%; overflow:hidden;"
      >
        <!-- Header area with padding -->
        <div style="padding:24px 24px 0;">
          <!-- Title -->
          <h1 style="font-size:22px; font-weight:600; letter-spacing:-0.02em; color:var(--text-strong); margin:0;">Skills</h1>
          <p style="font-size:14px; color:var(--muted); margin:4px 0 0;">Browse and manage your AI skills</p>

          <!-- Tabs (underline style) -->
          <div style="display:flex; gap:16px; border-bottom:1px solid var(--border); margin-top:16px;">
            ${this.renderTabBtn('local', `My Skills (${this.localSkills.length})`)}
            ${this.renderTabBtn('clawhub', 'Marketplace')}
          </div>

          <!-- Search + Sort -->
          ${this.tab === 'local' && this.localSkills.length > 0 ? html`
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
        </div>

        <!-- Content -->
        ${this.tab === 'local' ? html`
          <div
            style="flex:1; overflow-y:scroll; padding:12px 24px 24px;"
            @scroll=${this.onListScroll}
          >
            ${this.renderLocalGrid()}
          </div>
        ` : html`
          ${this.renderMarketplaceIframe()}
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
    const options = LOCAL_SORT_OPTIONS
    const current = this.localSort
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
                  this.localSort = opt.value as LocalSort
                  this.sortDropdownOpen = false
                  this.localVisible = LOAD_BATCH
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

  private renderMarketplaceIframe() {
    return html`
      <div style="display:flex; flex:1; min-height:0; padding:12px 24px 24px;">
        <div style="position:relative; flex:1; min-height:0; overflow:hidden; border-radius:var(--radius-lg); background:transparent;">
          ${this.marketplaceLoading ? html`
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:var(--bg); z-index:1;">
              <div style="display:flex; flex-direction:column; align-items:center; gap:12px; color:var(--muted);">
                <div style="width:32px; height:32px; border-radius:999px; border:2px solid color-mix(in srgb, var(--border) 70%, transparent); border-top-color:var(--accent);"></div>
                <span style="font-size:13px;">Loading Marketplace...</span>
              </div>
            </div>
          ` : nothing}
          <iframe
            src=${CLAWHUB_URL}
            title="ClawHub Marketplace"
            @load=${this.handleMarketplaceLoad}
            style="display:block; flex:1; width:100%; height:100%; border:none; background:transparent;"
          ></iframe>
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
}
