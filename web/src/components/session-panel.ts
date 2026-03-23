import { LitElement, html, nothing } from 'lit'
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
    return s.label || s.displayName || s.derivedTitle || s.key
  }

  private groupByDate(sessions: SessionItem[]): { label: string; items: SessionItem[] }[] {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7)

    const groups: { label: string; items: SessionItem[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Previous 7 days', items: [] },
      { label: 'Older', items: [] },
    ]

    for (const s of sessions) {
      const ts = s.updatedAt ?? 0
      if (ts >= todayStart.getTime()) groups[0].items.push(s)
      else if (ts >= yesterdayStart.getTime()) groups[1].items.push(s)
      else if (ts >= weekStart.getTime()) groups[2].items.push(s)
      else groups[3].items.push(s)
    }

    return groups.filter(g => g.items.length > 0)
  }

  private selectSession(key: string) {
    this.dispatchEvent(new CustomEvent('select-session', { detail: key, bubbles: true, composed: true }))
  }

  private async deleteSession(key: string, e: Event) {
    e.stopPropagation()
    try {
      await this.gateway.call('sessions.delete', { sessionKey: key })
      this.sessions = this.sessions.filter(s => s.key !== key)
    } catch { /* best effort */ }
  }

  private newChat() {
    this.dispatchEvent(new CustomEvent('new-chat', { bubbles: true, composed: true }))
  }

  override render() {
    const filtered = this.searchQuery
      ? this.sessions.filter(s => this.getTitle(s).toLowerCase().includes(this.searchQuery.toLowerCase()))
      : this.sessions
    const groups = this.groupByDate(filtered)

    return html`
      <div class="session-panel">
        <div class="session-panel__search">
          ${svgIcon('search', 14)}
          <input
            type="text"
            class="session-panel__search-input"
            placeholder="Search..."
            .value=${this.searchQuery}
            @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value }}
          />
        </div>

        <div class="session-panel__list">
          ${this.loading ? html`
            <div class="session-panel__empty">Loading...</div>
          ` : groups.length === 0 ? html`
            <div class="session-panel__empty">No conversations</div>
          ` : groups.map(group => html`
            <div class="session-panel__date-group">
              <div class="session-panel__date-label">${group.label}</div>
              ${group.items.map(s => html`
                <button
                  class="session-panel__item ${s.key === this.activeSessionKey ? 'session-panel__item--active' : ''}"
                  @click=${() => this.selectSession(s.key)}
                >
                  <span class="session-panel__item-title">${this.getTitle(s)}</span>
                  <button
                    class="session-panel__item-delete"
                    @click=${(e: Event) => this.deleteSession(s.key, e)}
                    title="Delete"
                  >${svgIcon('trash', 12)}</button>
                </button>
              `)}
            </div>
          `)}
        </div>

        <div class="session-panel__footer">
          <button class="session-panel__new-btn" @click=${this.newChat}>
            ${svgIcon('plus', 14)} New Chat
          </button>
        </div>
      </div>
    `
  }
}
