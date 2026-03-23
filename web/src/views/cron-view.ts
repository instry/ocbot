import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'

interface CronJob {
  id: string
  label?: string
  schedule?: string
  enabled?: boolean
  lastRunAt?: number
  lastRunStatus?: string
  nextRunAt?: number
}

@customElement('ocbot-cron-view')
export class OcbotCronView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() jobs: CronJob[] = []
  @state() loading = true
  @state() error: string | null = null

  private unsubCron?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.loadJobs()

    this.unsubCron = this.gateway.onEvent((event) => {
      if (event === 'cron') this.loadJobs()
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubCron?.()
  }

  private async loadJobs() {
    this.loading = true
    this.error = null
    try {
      const result = await this.gateway.call<{ jobs?: CronJob[] }>('cron.list')
      this.jobs = result?.jobs ?? []
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private async runJob(id: string, e: Event) {
    e.stopPropagation()
    try {
      await this.gateway.call('cron.run', { id })
    } catch { /* best effort */ }
  }

  private async toggleJob(job: CronJob, e: Event) {
    e.stopPropagation()
    try {
      await this.gateway.call('cron.update', { id: job.id, enabled: !job.enabled })
      this.jobs = this.jobs.map(j =>
        j.id === job.id ? { ...j, enabled: !j.enabled } : j
      )
    } catch { /* best effort */ }
  }

  private formatTime(ts?: number): string {
    if (!ts) return '--'
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  private statusDot(job: CronJob) {
    const color = job.enabled
      ? (job.lastRunStatus === 'error' ? 'var(--danger, #e53e3e)' : 'var(--success, #38a169)')
      : 'var(--warning, #d69e2e)'
    return html`<span style="
      display:inline-block; width:8px; height:8px; border-radius:50%;
      background:${color}; flex-shrink:0;
    "></span>`
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; margin-bottom:20px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Scheduled Tasks</h2>
          <span style="flex:1"></span>
          <button class="btn btn--sm" @click=${() => this.loadJobs()} title="Refresh">Refresh</button>
        </div>

        ${this.loading ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">Loading...</div>
        ` : this.error ? html`
          <div style="text-align:center; color:var(--danger); padding:40px;">${this.error}</div>
        ` : this.jobs.length === 0 ? html`
          <div style="text-align:center; color:var(--muted); padding:60px 20px;">
            <div style="margin-bottom:12px; color:var(--muted);">${svgIcon('calendar', 36)}</div>
            <div style="font-size:15px;">No scheduled tasks</div>
          </div>
        ` : html`
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${this.jobs.map(job => html`
              <div style="
                padding:12px 16px;
                border:1px solid var(--border);
                border-radius:8px;
                background:var(--surface, var(--bg));
              ">
                <div style="display:flex; align-items:center; gap:10px;">
                  ${this.statusDot(job)}
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:500; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                      ${job.label ?? job.id}
                    </div>
                    ${job.schedule ? html`
                      <div style="font-size:12px; color:var(--muted); margin-top:2px;">${job.schedule}</div>
                    ` : nothing}
                  </div>

                  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-size:12px; color:var(--muted); flex-shrink:0; margin-right:8px;">
                    <span>Last: ${this.formatTime(job.lastRunAt)}${job.lastRunStatus ? html` <span style="color:${job.lastRunStatus === 'error' ? 'var(--danger, #e53e3e)' : 'var(--success, #38a169)'}">${job.lastRunStatus}</span>` : nothing}</span>
                    ${job.nextRunAt ? html`<span>Next: ${this.formatTime(job.nextRunAt)}</span>` : nothing}
                  </div>

                  <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button
                      class="btn btn--sm"
                      @click=${(e: Event) => this.runJob(job.id, e)}
                      title="Run now"
                      style="min-width:32px; padding:4px 8px;"
                    >&#9654;</button>
                    <button
                      class="btn btn--sm"
                      @click=${(e: Event) => this.toggleJob(job, e)}
                      title=${job.enabled ? 'Pause' : 'Resume'}
                      style="min-width:32px; padding:4px 8px;"
                    >${job.enabled ? '\u23F8' : '\u25B6'}</button>
                  </div>
                </div>
              </div>
            `)}
          </div>
        `}
      </div>
    `
  }
}
