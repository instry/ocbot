import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from './icons'

interface SessionItem {
  key: string
  label?: string
  displayName?: string
  derivedTitle?: string
  lastMessagePreview?: string
  updatedAt: number | null
}

@customElement('ocbot-session-panel')
export class OcbotSessionPanel extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property() activeSessionKey = ''

  @state() sessions: SessionItem[] = []
  @state() searchQuery = ''
  @state() loading = true

  private unsubChanged?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.loadSessions()
    this.unsubChanged = this.gateway.onEvent((event) => {
      if (event === 'sessions.changed') this.loadSessions()
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubChanged?.()
  }

  private async loadSessions() {
    try {
      const result = await this.gateway.call<{ sessions?: SessionItem[] }>('sessions.list', {
        includeDerivedTitles: true,
        includeLastMessage: true,
      })
      this.sessions = (result?.sessions ?? [])
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    } catch { /* ignore */ }
    this.loading = false
  }

  private getTitle(s: SessionItem): string {
    const title = s.label || s.displayName || s.derivedTitle
    if (title) return title
    // Fallback: show "New Chat" instead of raw key like "ocbot:1711234567890"
    if (s.key.startsWith('ocbot:')) return 'New Chat'
    return s.key
  }

  private selectSession(key: string) {
    this.dispatchEvent(new CustomEvent('select-session', { detail: key, bubbles: true, composed: true }))
  }

  private deleteSession(key: string, e: Event) {
    e.stopPropagation()
    const prev = this.sessions
    this.sessions = prev.filter(s => s.key !== key)
    this.gateway.call('sessions.delete', { key }).catch(() => {
      this.sessions = prev
    })
  }

  private newChat() {
    this.dispatchEvent(new CustomEvent('new-chat', { bubbles: true, composed: true }))
  }

  override render() {
    const filtered = this.searchQuery
      ? this.sessions.filter(s => this.getTitle(s).toLowerCase().includes(this.searchQuery.toLowerCase()))
      : this.sessions

    return html`
      <div class="sub-nav sub-nav--full-height">
        <div class="sub-nav__search">
          ${svgIcon('search', 14)}
          <input
            type="text"
            class="sub-nav__search-input"
            placeholder="Search..."
            .value=${this.searchQuery}
            @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value }}
          />
        </div>

        <div class="sub-nav__actions">
          <button class="sub-nav__new-btn" @click=${this.newChat}>
            ${svgIcon('plus', 14)} New Chat
          </button>
        </div>

        <div class="sub-nav__list">
          ${this.loading ? html`
            <div class="sub-nav__empty">Loading...</div>
          ` : filtered.length === 0 ? html`
            <div class="sub-nav__empty">No conversations</div>
          ` : filtered.map(s => html`
            <div
              class="sub-nav__item ${s.key === this.activeSessionKey ? 'sub-nav__item--active' : ''}"
              role="button"
              tabindex="0"
              @click=${() => this.selectSession(s.key)}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.selectSession(s.key) }}
            >
              <span class="sub-nav__item-title">${this.getTitle(s)}</span>
              <button
                class="sub-nav__item-delete"
                @click=${(e: Event) => this.deleteSession(s.key, e)}
                title="Delete"
              >${svgIcon('trash', 12)}</button>
            </div>
          `)}
        </div>
      </div>
    `
  }
}
