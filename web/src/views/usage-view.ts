import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

interface UsageData {
  totalTokens?: number
  totalCost?: number
  sessions?: number
  models?: Array<{ model: string; tokens: number; cost: number }>
}

@customElement('ocbot-usage-view')
export class OcbotUsageView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() usage: UsageData | null = null
  @state() loading = true
  @state() error: string | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.loadUsage()
  }

  private async loadUsage() {
    this.loading = true
    this.error = null
    try {
      const result = await this.gateway.call<UsageData>('usage.status')
      this.usage = result
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private formatCost(cost: number | undefined): string {
    if (cost == null) return '--'
    return `$${cost.toFixed(4)}`
  }

  private formatTokens(tokens: number | undefined): string {
    if (tokens == null) return '--'
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
    return String(tokens)
  }

  private renderMetricCard(label: string, value: string) {
    return html`
      <div style="flex:1; min-width:120px; padding:16px; border-radius:8px; background:var(--surface, #f5f5f5); text-align:center;">
        <div style="font-size:24px; font-weight:600; color:var(--text-strong);">${value}</div>
        <div style="font-size:13px; color:var(--muted); margin-top:4px;">${label}</div>
      </div>
    `
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; margin-bottom:20px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Usage</h2>
        </div>

        ${this.loading ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">Loading...</div>
        ` : this.error ? html`
          <div style="text-align:center; color:var(--danger); padding:40px;">${this.error}</div>
        ` : !this.usage ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">
            <div>No usage data available</div>
          </div>
        ` : html`
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:20px;">
            ${this.renderMetricCard('Total Tokens', this.formatTokens(this.usage.totalTokens))}
            ${this.renderMetricCard('Total Cost', this.formatCost(this.usage.totalCost))}
            ${this.renderMetricCard('Sessions', this.usage.sessions != null ? String(this.usage.sessions) : '--')}
          </div>

          ${this.usage.models?.length ? html`
            <h3 style="font-size:16px; font-weight:500; color:var(--text-strong); margin:16px 0 8px;">By Model</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${this.usage.models.map(m => html`
                <div class="session-card">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:500; color:var(--text-strong); flex:1;">${m.model}</span>
                    <span style="font-size:13px; color:var(--muted);">${this.formatTokens(m.tokens)} tokens</span>
                    <span style="font-size:13px; color:var(--muted);">${this.formatCost(m.cost)}</span>
                  </div>
                </div>
              `)}
            </div>
          ` : nothing}
        `}
      </div>
    `
  }
}
