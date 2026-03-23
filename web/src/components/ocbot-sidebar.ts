import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { svgIcon } from './icons'

type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'channels' | 'usage' | 'config' | 'settings'

interface NavItem {
  id: Tab
  label: string
}

const NAV_GROUPS: { items: NavItem[] }[] = [
  {
    items: [
      { id: 'chat', label: 'Chat' },
      { id: 'sessions', label: 'Sessions' },
      { id: 'cron', label: 'Cron' },
    ]
  },
  {
    items: [
      { id: 'agents', label: 'Agents' },
      { id: 'skills', label: 'Skills' },
      { id: 'channels', label: 'Channels' },
    ]
  },
  {
    items: [
      { id: 'usage', label: 'Usage' },
      { id: 'config', label: 'Config' },
    ]
  },
]

@customElement('ocbot-sidebar')
export class OcbotSidebar extends LitElement {
  override createRenderRoot() { return this }

  @property() activeTab: Tab = 'chat'
  @property() gatewayState: string = 'disconnected'

  private _statusDot() {
    switch (this.gatewayState) {
      case 'connected': return html`<span style="color:var(--ok)">●</span>`
      case 'connecting': return html`<span style="color:var(--warn)">◐</span>`
      default: return html`<span style="color:var(--danger)">○</span>`
    }
  }

  private _statusText() {
    switch (this.gatewayState) {
      case 'connected': return 'Connected'
      case 'connecting': return 'Connecting...'
      case 'error': return 'Error'
      default: return 'Disconnected'
    }
  }

  override render() {
    return html`
      <nav class="ocbot-sidebar">
        <!-- Brand -->
        <div class="ocbot-sidebar__brand">
          <div class="ocbot-sidebar__logo"><img src="/logo.png" alt="" style="width:20px; height:20px; vertical-align:middle; margin-right:6px;" />Ocbot</div>
          <div class="ocbot-sidebar__status">
            ${this._statusDot()} ${this._statusText()}
          </div>
        </div>

        <!-- Nav groups -->
        ${NAV_GROUPS.map(group => html`
          <div class="ocbot-sidebar__group">
            ${group.items.map(item => html`
              <button
                class="ocbot-sidebar__item ${this.activeTab === item.id ? 'ocbot-sidebar__item--active' : ''}"
                @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: item.id }))}
              >
                <span class="ocbot-sidebar__icon">${svgIcon(item.id)}</span>
                <span class="ocbot-sidebar__label">${item.label}</span>
              </button>
            `)}
          </div>
        `)}

        <!-- Footer -->
        <div class="ocbot-sidebar__footer">
          <button
            class="ocbot-sidebar__item ${this.activeTab === 'settings' ? 'ocbot-sidebar__item--active' : ''}"
            @click=${() => this.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' }))}
          >
            <span class="ocbot-sidebar__icon">${svgIcon('settings')}</span>
            <span class="ocbot-sidebar__label">Settings</span>
          </button>
          <div class="ocbot-sidebar__version">v${__OCBOT_VERSION__ ?? '0.0.0'}</div>
        </div>
      </nav>
    `
  }
}
