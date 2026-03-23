import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'channels' | 'usage' | 'config' | 'settings'

interface NavItem {
  id: Tab
  icon: string
  label: string
}

const NAV_GROUPS: { items: NavItem[] }[] = [
  {
    items: [
      { id: 'chat', icon: '💬', label: 'Chat' },
      { id: 'sessions', icon: '📋', label: 'Sessions' },
      { id: 'cron', icon: '⏰', label: 'Cron' },
    ]
  },
  {
    items: [
      { id: 'agents', icon: '🤖', label: 'Agents' },
      { id: 'skills', icon: '🔧', label: 'Skills' },
      { id: 'channels', icon: '📡', label: 'Channels' },
    ]
  },
  {
    items: [
      { id: 'usage', icon: '📊', label: 'Usage' },
      { id: 'config', icon: '⚙', label: 'Config' },
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
                <span class="ocbot-sidebar__icon">${item.icon}</span>
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
            <span class="ocbot-sidebar__icon">⚙</span>
            <span class="ocbot-sidebar__label">Settings</span>
          </button>
          <div class="ocbot-sidebar__version">v${__OCBOT_VERSION__ ?? '0.0.0'}</div>
        </div>
      </nav>
    `
  }
}
