import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

interface ToolRow {
  name: string
  description?: string
  type?: string
}

@customElement('ocbot-skills-view')
export class OcbotSkillsView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() tools: ToolRow[] = []
  @state() loading = true
  @state() error: string | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.loadTools()
  }

  private async loadTools() {
    this.loading = true
    this.error = null
    try {
      // Try tools.catalog first, fall back to skills.status
      let result = await this.gateway.call<{ tools?: ToolRow[] }>('tools.catalog').catch(() => null)
      if (!result?.tools) {
        result = await this.gateway.call<{ tools?: ToolRow[] }>('skills.status').catch(() => null)
      }
      this.tools = result?.tools ?? []
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; margin-bottom:20px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Skills</h2>
        </div>

        ${this.loading ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">Loading...</div>
        ` : this.error ? html`
          <div style="text-align:center; color:var(--danger); padding:40px;">${this.error}</div>
        ` : this.tools.length === 0 ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">
            <div>No skills installed</div>
          </div>
        ` : html`
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${this.tools.map(t => html`
              <div class="session-card">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-weight:500; color:var(--text-strong); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${t.name}
                  </span>
                  ${t.type ? html`
                    <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:var(--surface, #f5f5f5); color:var(--muted); flex-shrink:0;">
                      ${t.type}
                    </span>
                  ` : nothing}
                </div>
                ${t.description ? html`
                  <div style="font-size:13px; color:var(--muted); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${t.description}
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
