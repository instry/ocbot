import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'

interface SessionRow {
  key: string
  label?: string
  displayName?: string
  derivedTitle?: string
  lastMessagePreview?: string
  channel?: string
  updatedAt: number | null
  model?: string
}

@customElement('ocbot-sessions-view')
export class OcbotSessionsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() sessions: SessionRow[] = []
  @state() loading = true
  @state() error: string | null = null

  private unsubChanged?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.loadSessions()

    this.unsubChanged = this.gateway.onEvent((event) => {
      if (event === 'sessions.changed') this.loadSessions()
    })

    // Subscribe to session events
    this.gateway.call('sessions.subscribe').catch(() => {})
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubChanged?.()
    this.gateway.call('sessions.unsubscribe').catch(() => {})
  }

  private async loadSessions() {
    this.loading = true
    this.error = null
    try {
      const result = await this.gateway.call<{ sessions?: SessionRow[] }>('sessions.list', {
        includeDerivedTitles: true,
        includeLastMessage: true,
      })
      this.sessions = (result?.sessions ?? [])
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private getTitle(s: SessionRow): string {
    return s.label || s.displayName || s.derivedTitle || s.key
  }

  private getTimeAgo(ts: number | null): string {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60_000) return 'just now'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
    return `${Math.floor(diff / 86400_000)}d ago`
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

  private async createSession() {
    try {
      const result = await this.gateway.call<{ sessionKey?: string }>('sessions.create', {
        label: `Session ${new Date().toLocaleDateString()}`,
      })
      if (result?.sessionKey) {
        this.selectSession(result.sessionKey)
      }
    } catch { /* best effort */ }
    this.loadSessions()
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; margin-bottom:20px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Sessions</h2>
          <span style="flex:1"></span>
          <button class="btn" @click=${this.createSession}>+ New</button>
        </div>

        ${this.loading ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">Loading...</div>
        ` : this.error ? html`
          <div style="text-align:center; color:var(--danger); padding:40px;">${this.error}</div>
        ` : this.sessions.length === 0 ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">
            <div style="margin-bottom:8px; color:var(--muted);">${svgIcon('clipboard', 32)}</div>
            <div>No sessions yet</div>
          </div>
        ` : html`
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${this.sessions.map(s => html`
              <div
                class="session-card"
                @click=${() => this.selectSession(s.key)}
              >
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-weight:500; color:var(--text-strong); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${this.getTitle(s)}
                  </span>
                  <span style="font-size:12px; color:var(--muted); flex-shrink:0;">
                    ${this.getTimeAgo(s.updatedAt)}
                  </span>
                  <button
                    class="session-card__delete"
                    @click=${(e: Event) => this.deleteSession(s.key, e)}
                    title="Delete"
                  >×</button>
                </div>
                ${s.lastMessagePreview ? html`
                  <div style="font-size:13px; color:var(--muted); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${s.lastMessagePreview}
                  </div>
                ` : nothing}
              </div>
            `)}
          </div>
        `}
      </div>
    `
  }
}
