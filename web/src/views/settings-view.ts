import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'

declare const __OCBOT_VERSION__: string

type SettingsTab = 'general' | 'about'
type ThemeMode = 'system' | 'light' | 'dark'

@customElement('ocbot-settings-view')
export class OcbotSettingsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() activeTab: SettingsTab = 'general'
  @state() theme: ThemeMode = 'system'

  override connectedCallback() {
    super.connectedCallback()
    const stored = localStorage.getItem('ocbot.theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      this.theme = stored
    }
    this.applyTheme(this.theme)
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
