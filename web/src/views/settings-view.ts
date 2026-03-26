import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'

declare const __OCBOT_VERSION__: string
declare const __OCBOT_BROWSER_PATH__: string

type SettingsTab = 'general' | 'browser' | 'about'
type ThemeMode = 'system' | 'light' | 'dark'
type BrowserChoice = 'ocbot' | 'system' | 'custom'

// chrome.ocbot API type (injected by Ocbot browser)
interface OcbotBrowserProfileInfo {
  directory: string
  name: string
  path: string
}

interface OcbotOcbotBrowserProfilesResult {
  browser: { kind: string; userDataDir: string }
  profiles: OcbotBrowserProfileInfo[]
}

function getChromeOcbotApi(): { getBrowserProfiles(cb: (r: OcbotOcbotBrowserProfilesResult[]) => void): void } | null {
  try {
    const c = globalThis as Record<string, unknown>
    const chromeObj = c.chrome as Record<string, unknown> | undefined
    const ocbotApi = chromeObj?.ocbot as { getBrowserProfiles?: (cb: (r: OcbotOcbotBrowserProfilesResult[]) => void) => void } | undefined
    if (ocbotApi?.getBrowserProfiles) return ocbotApi as ReturnType<typeof getChromeOcbotApi>
  } catch { /* not available */ }
  return null
}

@customElement('ocbot-settings-view')
export class OcbotSettingsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() activeTab: SettingsTab = 'general'
  @state() theme: ThemeMode = 'system'
  // Browser settings — editing state
  @state() browserChoice: BrowserChoice = 'ocbot'
  @state() customBrowserPath: string = ''
  @state() selectedProfileKey: string = ''  // "kind:directory" e.g. "chrome:Profile 1"
  // Browser settings — saved state (for cancel/dirty detection)
  private _savedBrowserChoice: BrowserChoice = 'ocbot'
  private _savedCustomBrowserPath: string = ''
  private _savedProfileKey: string = ''
  // Browser settings — infra
  @state() configHash: string | null = null
  @state() browserSaving: boolean = false
  @state() browserSaveSuccess: boolean = false
  @state() browserProfiles: OcbotBrowserProfilesResult[] = []

  private get _browserDirty(): boolean {
    return this.browserChoice !== this._savedBrowserChoice
      || this.customBrowserPath !== this._savedCustomBrowserPath
      || this.selectedProfileKey !== this._savedProfileKey
  }

  override connectedCallback() {
    super.connectedCallback()
    const stored = localStorage.getItem('ocbot.theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      this.theme = stored
    }
    this.applyTheme(this.theme)
    this._loadBrowserConfig()
  }

  private async _loadBrowserConfig() {
    // Load profiles first so we can match saved config
    await this._loadBrowserProfiles()

    try {
      const result = await this.gateway.call<{
        config?: { browser?: { executablePath?: string; defaultProfile?: string; profiles?: Record<string, { userDataDir?: string; driver?: string }> } }
        hash?: string
      }>('config.get')
      this.configHash = result?.hash ?? null

      // Restore browser choice
      const execPath = result?.config?.browser?.executablePath ?? ''
      if (!execPath) {
        this.browserChoice = 'system'
      } else if (execPath === this._ocbotBrowserPath || execPath.toLowerCase().includes('ocbot')) {
        this.browserChoice = 'ocbot'
      } else {
        this.browserChoice = 'custom'
        this.customBrowserPath = execPath
      }

      // Restore selected profile
      const userProfile = result?.config?.browser?.profiles?.user
      if (userProfile?.userDataDir && userProfile?.driver === 'existing-session') {
        for (const b of this.browserProfiles) {
          if (b.browser.userDataDir === userProfile.userDataDir) {
            // Find the specific profile directory from the config
            // The userDataDir matches the browser, now find which profile sub-dir
            for (const p of b.profiles) {
              const key = `${b.browser.kind}:${p.directory}`
              this.selectedProfileKey = key
              break
            }
            break
          }
        }
      }

      // Save as baseline for dirty detection
      this._savedBrowserChoice = this.browserChoice
      this._savedCustomBrowserPath = this.customBrowserPath
      this._savedProfileKey = this.selectedProfileKey
    } catch {
      // Gateway not connected yet — keep defaults
    }
  }

  private async _loadBrowserProfiles() {
    try {
      const api = getChromeOcbotApi()
      if (api) {
        const results = await new Promise<OcbotBrowserProfilesResult[]>((resolve) => {
          api.getBrowserProfiles(resolve)
        })
        this.browserProfiles = results
      }
    } catch {
      // API not available (running in regular Chrome, not Ocbot)
    }
  }

  private get _ocbotBrowserPath(): string {
    try {
      return typeof __OCBOT_BROWSER_PATH__ !== 'undefined' ? __OCBOT_BROWSER_PATH__ : ''
    } catch {
      return ''
    }
  }

  private _setBrowserChoice(choice: BrowserChoice) {
    this.browserChoice = choice
    this.requestUpdate()
  }

  private async _saveBrowserConfig() {
    if (this.browserSaving) return
    this.browserSaving = true
    try {
      const value = this.browserChoice === 'ocbot'
        ? this._ocbotBrowserPath
        : this.browserChoice === 'custom'
          ? this.customBrowserPath
          : null

      const browserPatch: Record<string, unknown> = { executablePath: value }

      // If a profile is selected and browser is "system", configure existing-session profile
      if (this.browserChoice === 'system' && this.selectedProfileKey) {
        const profileConfig = this._resolveSelectedProfile()
        if (profileConfig) {
          browserPatch.profiles = {
            user: {
              driver: 'existing-session',
              userDataDir: profileConfig.userDataDir,
              attachOnly: true,
              color: '#00AA00',
            }
          }
          browserPatch.defaultProfile = 'user'
        }
      } else {
        // Clear profile config when not using system browser
        browserPatch.profiles = { user: null }
        browserPatch.defaultProfile = null
      }

      await this.gateway.call('config.patch', {
        baseHash: this.configHash,
        raw: JSON.stringify({ browser: browserPatch }),
      })

      const result = await this.gateway.call<{ hash?: string }>('config.get')
      this.configHash = result?.hash ?? null

      // Update saved baseline
      this._savedBrowserChoice = this.browserChoice
      this._savedCustomBrowserPath = this.customBrowserPath
      this._savedProfileKey = this.selectedProfileKey

      // Flash success
      this.browserSaveSuccess = true
      setTimeout(() => { this.browserSaveSuccess = false }, 2500)
    } catch (err) {
      console.error('Failed to save browser config:', err)
    } finally {
      this.browserSaving = false
    }
  }

  private _cancelBrowserConfig() {
    this.browserChoice = this._savedBrowserChoice
    this.customBrowserPath = this._savedCustomBrowserPath
    this.selectedProfileKey = this._savedProfileKey
  }

  private _resolveSelectedProfile(): { userDataDir: string; directory: string } | null {
    if (!this.selectedProfileKey) return null
    const [kind, ...rest] = this.selectedProfileKey.split(':')
    const directory = rest.join(':')
    for (const b of this.browserProfiles) {
      if (b.browser.kind === kind) {
        const profile = b.profiles.find(p => p.directory === directory)
        if (profile) {
          return { userDataDir: b.browser.userDataDir, directory: profile.directory }
        }
      }
    }
    return null
  }

  private _onProfileChange(e: Event) {
    this.selectedProfileKey = (e.target as HTMLSelectElement).value
  }

  private _onCustomPathInput(e: Event) {
    this.customBrowserPath = (e.target as HTMLInputElement).value
  }

  private setTheme(mode: ThemeMode) {
    this.theme = mode
    localStorage.setItem('ocbot.theme', mode)
    this.applyTheme(mode)
  }

  private applyTheme(mode: ThemeMode) {
    const root = document.documentElement
    if (mode === 'system') {
      root.removeAttribute('data-theme-mode')
    } else {
      root.setAttribute('data-theme-mode', mode)
    }
  }

  private get version(): string {
    try {
      return typeof __OCBOT_VERSION__ !== 'undefined' ? __OCBOT_VERSION__ : 'dev'
    } catch {
      return 'dev'
    }
  }

  override render() {
    const tabs: { id: SettingsTab; icon: string; label: string }[] = [
      { id: 'general', icon: 'sliders', label: 'General' },
      { id: 'browser', icon: 'globe', label: 'Browser' },
      { id: 'about', icon: 'info', label: 'About' },
    ]

    return html`
      <div class="settings">
        <!-- Sub-nav sidebar -->
        <div class="sub-nav">
          <div class="sub-nav__header">Settings</div>
          <nav class="sub-nav__items">
            ${tabs.map(t => html`
              <button
                class="sub-nav__btn ${this.activeTab === t.id ? 'sub-nav__btn--active' : ''}"
                @click=${() => { this.activeTab = t.id }}
              >
                <span class="sub-nav__icon">${svgIcon(t.icon, 16)}</span>
                <span>${t.label}</span>
              </button>
            `)}
          </nav>
        </div>

        <!-- Content area -->
        <div class="settings__content">
          ${this.activeTab === 'general' ? this._renderGeneralTab() : nothing}
          ${this.activeTab === 'browser' ? this._renderBrowserTab() : nothing}
          ${this.activeTab === 'about' ? this._renderAboutTab() : nothing}
        </div>
      </div>
    `
  }

  /* ───────── General Tab ───────── */

  private _renderGeneralTab() {
    const themes: { value: ThemeMode; label: string; icon: string }[] = [
      { value: 'system', label: 'System', icon: 'monitor' },
      { value: 'light', label: 'Light', icon: 'sun' },
      { value: 'dark', label: 'Dark', icon: 'moon' },
    ]

    return html`
      <div class="settings__page">
        <h2 class="settings__page-title">General</h2>

        <div class="settings__sections">
          <!-- Appearance -->
          <div class="settings__section">
            <h3 class="settings__section-title">Appearance</h3>
            <div class="settings__section-card">
              <div class="settings__row">
                <div class="settings__row-info">
                  <span class="settings__row-title">Color Scheme</span>
                  <span class="settings__row-desc">Choose your preferred theme</span>
                </div>
                <div class="settings__theme-toggle">
                  ${themes.map(t => html`
                    <button
                      class="settings__theme-btn ${this.theme === t.value ? 'settings__theme-btn--active' : ''}"
                      @click=${() => this.setTheme(t.value)}
                    >
                      <span class="settings__theme-icon">${svgIcon(t.icon, 14)}</span>
                      ${t.label}
                    </button>
                  `)}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    `
  }

  /* ───────── Browser Tab ───────── */

  private _renderBrowserTab() {
    const browsers: { value: BrowserChoice; label: string; icon: string }[] = [
      { value: 'ocbot', label: 'Ocbot', icon: 'monitor' },
      { value: 'system', label: 'System', icon: 'globe' },
      { value: 'custom', label: 'Custom', icon: 'sliders' },
    ]

    return html`
      <div class="settings__page">
        <h2 class="settings__page-title">Browser</h2>

        <div class="settings__sections">
          <!-- Agent Browser -->
          <div class="settings__section">
            <h3 class="settings__section-title">Agent Browser</h3>
            <div class="settings__section-card">
              <div class="settings__row">
                <div class="settings__row-info">
                  <span class="settings__row-title">Browser</span>
                  <span class="settings__row-desc">Browser used when Agent performs tasks</span>
                </div>
                <div class="settings__theme-toggle">
                  ${browsers.map(b => html`
                    <button
                      class="settings__theme-btn ${this.browserChoice === b.value ? 'settings__theme-btn--active' : ''}"
                      ?disabled=${this.browserSaving}
                      @click=${() => this._setBrowserChoice(b.value)}
                    >
                      <span class="settings__theme-icon">${svgIcon(b.icon, 14)}</span>
                      ${b.label}
                    </button>
                  `)}
                </div>
              </div>
              ${this.browserChoice === 'custom' ? html`
                <div class="settings__row">
                  <div class="settings__row-info" style="flex:1">
                    <span class="settings__row-title">Executable Path</span>
                    <input
                      type="text"
                      class="settings__browser-input"
                      placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                      .value=${this.customBrowserPath}
                      @input=${this._onCustomPathInput}
                    />
                  </div>
                </div>
              ` : nothing}
            </div>
          </div>

          <!-- Profile -->
          ${this.browserChoice === 'system' && this.browserProfiles.length > 0 ? html`
            <div class="settings__section">
              <h3 class="settings__section-title">Profile</h3>
              <div class="settings__section-card">
                <div class="settings__row">
                  <div class="settings__row-info">
                    <span class="settings__row-title">Chrome Profile</span>
                    <span class="settings__row-desc">Use an existing browser profile with saved logins</span>
                  </div>
                  <select
                    class="settings__browser-select"
                    .value=${this.selectedProfileKey}
                    @change=${this._onProfileChange}
                    ?disabled=${this.browserSaving}
                  >
                    <option value="">Auto-detect</option>
                    ${this.browserProfiles.map(b => html`
                      <optgroup label=${b.browser.kind.charAt(0).toUpperCase() + b.browser.kind.slice(1)}>
                        ${b.profiles.map(p => html`
                          <option
                            value=${`${b.browser.kind}:${p.directory}`}
                            ?selected=${this.selectedProfileKey === `${b.browser.kind}:${p.directory}`}
                          >${p.name}</option>
                        `)}
                      </optgroup>
                    `)}
                  </select>
                </div>
              </div>
            </div>
          ` : nothing}

          <!-- Save / Cancel -->
          <div class="settings__actions">
            <button
              class="settings__cancel-btn"
              @click=${() => this._cancelBrowserConfig()}
              ?disabled=${!this._browserDirty || this.browserSaving}
            >Cancel</button>
            <button
              class="settings__save-btn"
              @click=${() => this._saveBrowserConfig()}
              ?disabled=${!this._browserDirty || this.browserSaving}
            >${this.browserSaving ? 'Saving...' : 'Save'}</button>
            ${this.browserSaveSuccess ? html`
              <span class="settings__save-success">Saved</span>
            ` : nothing}
          </div>

        </div>
      </div>
    `
  }

  private _renderAboutTab() {
    const faqs = [
      { q: 'What are you exactly?', a: "I'm a new species! Part browser, part AI agent. Think of me as a very helpful octopus that lives in your browser tabs." },
      { q: 'Why the name "ocbot"?', a: 'Because "octo" means 8! I\'m an octopus-inspired bot with eight arms ready to multitask across the web.' },
      { q: 'Why purple?', a: "Because I'm hitting the big time — only royalty gets to be purple. Plus it's the color of a certain deep-sea creature." },
      { q: 'Your avatar only has 5 arms.', a: 'The other 3 are hidden behind me, duh.' },
      { q: 'Will you leak my data?', a: "Nope! All your data is stored locally in your browser. I don't phone home. Your conversations, your skills, your settings — all yours." },
    ]

    const socials = [
      { name: 'X', url: 'https://x.com/ocbot_ai' },
      { name: 'Instagram', url: 'https://instagram.com/ocbot_ai' },
      { name: 'YouTube', url: 'https://youtube.com/@ocbot_ai' },
      { name: 'Discord', url: 'https://discord.gg/ocbot_ai' },
      { name: 'TikTok', url: 'https://tiktok.com/@ocbot_ai' },
    ]

    return html`
      <div class="settings__tab-content">
        <div class="about">
          <!-- Avatar + Name -->
          <div class="about__hero">
            <div class="about__avatar">
              <img src="/logo.png" alt="Ocbot" style="width:48px; height:48px;" />
            </div>
            <h1 class="about__name">ocbot</h1>
            <p class="about__tagline">Got brains, got arms, up before the alarm.</p>
          </div>

          <!-- Intro -->
          <div class="about__card">
            <p class="about__intro">
              My name is ocbot. I'm super smart and super quick at getting things done.
              I live inside your browser with eight nimble arms ready to handle any task.
              Ask me to find info, fill forms, compare products, or automate your online work.
              I don't sleep, I don't forget, and I'm always ready.
            </p>
          </div>

          <!-- FAQ -->
          <div class="about__section">
            <h2 class="about__section-title">${svgIcon('message-question', 16)} FAQ</h2>
            <div class="about__faq-list">
              ${faqs.map(f => html`
                <div class="about__card">
                  <p class="about__faq-q">Q: ${f.q}</p>
                  <p class="about__faq-a">${f.a}</p>
                </div>
              `)}
            </div>
          </div>

          <!-- Contact & Socials -->
          <div class="about__footer">
            <div class="about__links">
              <a href="https://oc.bot" target="_blank" rel="noopener">${svgIcon('globe', 14)} oc.bot</a>
              <a href="mailto:hi@oc.bot">${svgIcon('mail', 14)} hi@oc.bot</a>
            </div>
            <div class="about__socials">
              ${socials.map(s => html`
                <a href=${s.url} target="_blank" rel="noopener" class="about__social-pill">${s.name}</a>
              `)}
            </div>
            <div class="about__version">v${this.version}</div>
          </div>
        </div>
      </div>
    `
  }
}
