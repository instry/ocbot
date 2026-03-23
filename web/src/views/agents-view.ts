import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

interface AgentRow {
  id: string
  model?: string
  label?: string
  tools?: number
  skills?: number
  files?: { identity?: string }
  toolsList?: Array<{ name: string }>
}

@customElement('ocbot-agents-view')
export class OcbotAgentsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() agents: AgentRow[] = []
  @state() loading = true
  @state() error: string | null = null
  @state() expandedId: string | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.loadAgents()
  }

  private async loadAgents() {
    this.loading = true
    this.error = null
    try {
      const result = await this.gateway.call<{ agents?: AgentRow[] }>('agents.list')
      this.agents = result?.agents ?? []
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private toggleExpand(id: string) {
    this.expandedId = this.expandedId === id ? null : id
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; margin-bottom:20px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Agents</h2>
        </div>

        ${this.loading ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">Loading...</div>
        ` : this.error ? html`
          <div style="text-align:center; color:var(--danger); padding:40px;">${this.error}</div>
        ` : this.agents.length === 0 ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">
            <div>No agents available</div>
          </div>
        ` : html`
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${this.agents.map(a => html`
              <div
                class="session-card"
                @click=${() => this.toggleExpand(a.id)}
                style="cursor:pointer;"
              >
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-weight:500; color:var(--text-strong); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${a.label || a.id}
                  </span>
                  <span style="font-size:12px; color:var(--muted); flex-shrink:0;">
                    ${a.model ?? ''}
                  </span>
                </div>
                <div style="display:flex; gap:12px; margin-top:4px; font-size:13px; color:var(--muted);">
                  ${a.tools != null ? html`<span>Tools: ${a.tools}</span>` : nothing}
                  ${a.skills != null ? html`<span>Skills: ${a.skills}</span>` : nothing}
                </div>
                ${this.expandedId === a.id ? html`
                  <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
                    ${a.files?.identity ? html`
                      <div style="font-size:13px; color:var(--muted); margin-bottom:8px; white-space:pre-wrap;">${a.files.identity}</div>
                    ` : nothing}
                    ${a.toolsList?.length ? html`
                      <div style="font-size:13px; color:var(--muted);">
                        <div style="font-weight:500; margin-bottom:4px;">Tools:</div>
                        ${a.toolsList.map(t => html`<div style="padding-left:8px;">- ${t.name}</div>`)}
                      </div>
                    ` : nothing}
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
