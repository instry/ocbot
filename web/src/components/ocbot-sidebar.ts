import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { svgIcon } from './icons'

export type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'models' | 'channels' | 'usage' | 'config' | 'settings'

interface NavItem {
  id: Tab
  label: string
  icon: string
}

const NAV_GROUPS: NavItem[][] = [
  [
    { id: 'chat', label: 'Chat', icon: 'chat' },
  ],
  [
    { id: 'agents', label: 'Agents', icon: 'bot' },
    { id: 'skills', label: 'Skills', icon: 'component' },
    { id: 'cron', label: 'Cron', icon: 'cron' },
  ],
  [
    { id: 'models', label: 'Models', icon: 'cpu' },
    { id: 'channels', label: 'Channels', icon: 'smartphone' },
  ],
  [
    { id: 'usage', label: 'Usage', icon: 'usage' },
  ],
]

declare const __OCBOT_VERSION__: string

@customElement('ocbot-sidebar')
export class OcbotSidebar extends LitElement {
  override createRenderRoot() { return this }

  @property() activeTab: Tab = 'chat'
  @property() gatewayState: string = 'disconnected'

  private _statusColor() {
    switch (this.gatewayState) {
      case 'connected': return 'var(--ok)'
      case 'connecting': return 'var(--warn)'
      default: return 'var(--danger)'
    }
  }

  private _version(): string {
    try {
      return typeof __OCBOT_VERSION__ !== 'undefined' ? __OCBOT_VERSION__ : 'dev'
    } catch {
      return 'dev'
    }
  }

  override render() {
    return html`
      <nav class="icon-bar">
        <div class="icon-bar__logo" title="Ocbot">
          <img src="/logo.png" alt="" width="22" height="22" />
          <span class="icon-bar__logo-name">Ocbot</span>
          <span class="icon-bar__status-dot" style="background:${this._statusColor()}"></span>
        </div>

        ${NAV_GROUPS.map(group => html`
          <div class="icon-bar__group">
            ${group.map(item => html`
              <button
                class="icon-bar__btn ${this.activeTab === item.id ? 'icon-bar__btn--active' : ''}"
                @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: item.id }))}
              >
                ${svgIcon(item.icon, 18)}
                <span class="icon-bar__label">${item.label}</span>
              </button>
            `)}
          </div>
        `)}

        <div class="icon-bar__footer">
          <button
            class="icon-bar__btn ${this.activeTab === 'settings' ? 'icon-bar__btn--active' : ''}"
            @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' }))}
          >
            ${svgIcon('settings', 18)}
            <span class="icon-bar__label">Settings</span>
          </button>
          <span class="icon-bar__version">v${this._version()}</span>
        </div>
      </nav>
    `
  }
}
