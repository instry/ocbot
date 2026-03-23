import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

declare const __OCBOT_VERSION__: string

type ThemeMode = 'system' | 'light' | 'dark'

@customElement('ocbot-settings-view')
export class OcbotSettingsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

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
    const themes: { value: ThemeMode; label: string }[] = [
      { value: 'system', label: 'System' },
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ]

    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0 0 24px 0;">Settings</h2>

        <!-- Theme -->
        <section style="margin-bottom:32px;">
          <h3 style="font-size:14px; font-weight:600; color:var(--text-strong); margin:0 0 12px 0; text-transform:uppercase; letter-spacing:0.05em;">Appearance</h3>
          <div style="
            padding:16px;
            border:1px solid var(--border);
            border-radius:8px;
            background:var(--surface, var(--bg));
          ">
            <div style="font-size:14px; color:var(--text); margin-bottom:10px;">Theme</div>
            <div style="display:flex; gap:8px;">
              ${themes.map(t => html`
                <button
                  class="btn btn--sm"
                  style="
                    flex:1;
                    ${this.theme === t.value ? `
                      background:var(--accent);
                      color:#fff;
                      border-color:var(--accent);
                    ` : ''}
                  "
                  @click=${() => this.setTheme(t.value)}
                >${t.label}</button>
              `)}
            </div>
          </div>
        </section>

        <!-- About -->
        <section>
          <h3 style="font-size:14px; font-weight:600; color:var(--text-strong); margin:0 0 12px 0; text-transform:uppercase; letter-spacing:0.05em;">About</h3>
          <div style="
            padding:16px;
            border:1px solid var(--border);
            border-radius:8px;
            background:var(--surface, var(--bg));
          ">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
              <img src="/logo.png" alt="Ocbot" style="width:32px; height:32px;" />
              <div>
                <div style="font-weight:600; color:var(--text-strong); font-size:16px;">Ocbot</div>
                <div style="font-size:13px; color:var(--muted);">v${this.version}</div>
              </div>
            </div>
            <div style="font-size:13px; color:var(--muted);">Powered by OpenClaw</div>
          </div>
        </section>
      </div>
    `
  }
}
