import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { unsafeSVG } from 'lit/directives/unsafe-svg.js'

type Tab = 'chat' | 'sessions' | 'cron' | 'agents' | 'skills' | 'channels' | 'usage' | 'config' | 'settings'

// SVG icon paths (lucide-style, 24x24 viewBox)
const ICONS: Record<string, string> = {
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  sessions: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  cron: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  agents: '<path d="M12 8V4H8"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M12 18v4"/><path d="M12 2v2"/>',
  skills: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  channels: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  usage: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
}

function sidebarIcon(name: string) {
  const paths = ICONS[name] ?? ''
  return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${unsafeSVG(paths)}</svg>`
}

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
                <span class="ocbot-sidebar__icon">${sidebarIcon(item.id)}</span>
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
            <span class="ocbot-sidebar__icon">${sidebarIcon('settings')}</span>
            <span class="ocbot-sidebar__label">Settings</span>
          </button>
          <div class="ocbot-sidebar__version">v${__OCBOT_VERSION__ ?? '0.0.0'}</div>
        </div>
      </nav>
    `
  }
}
