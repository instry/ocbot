import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'

interface CronSchedule {
  kind: 'cron' | 'every' | 'at'
  expr?: string
  tz?: string
  everyMs?: number
  at?: string
}

interface CronPayload {
  kind: 'agentTurn' | 'systemEvent'
  message?: string
  text?: string
}

interface CronJobState {
  nextRunAtMs?: number
  lastRunAtMs?: number
  lastRunStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
}

interface CronJob {
  id: string
  name: string
  description?: string
  enabled: boolean
  schedule: CronSchedule
  payload: CronPayload
  state: CronJobState
}

interface CronRunEntry {
  jobId: string
  ranAtMs: number
  status: 'ok' | 'error' | 'skipped'
  error?: string
  summary?: string
  durationMs?: number
}

type FormMode = 'create' | 'edit'
type ScheduleKind = 'cron' | 'every' | 'at'

@customElement('ocbot-cron-view')
export class OcbotCronView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() jobs: CronJob[] = []
  @state() loading = true
  @state() error: string | null = null

  @state() private formOpen = false
  @state() private formMode: FormMode = 'create'
  @state() private formEditId: string | null = null
  @state() private formName = ''
  @state() private formScheduleKind: ScheduleKind = 'cron'
  @state() private formScheduleValue = ''
  @state() private formMessage = ''
  @state() private formSaving = false

  @state() private expandedJobId: string | null = null
  @state() private runs: CronRunEntry[] = []
  @state() private runsLoading = false

  @state() private confirmDeleteId: string | null = null

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
      const result = await this.gateway.call<{ jobs?: CronJob[] }>('cron.list', {
        includeDisabled: true,
      })
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
      await this.gateway.call('cron.update', {
        id: job.id,
        patch: { enabled: !job.enabled },
      })
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

  private formatSchedule(schedule?: CronSchedule): string {
    if (!schedule) return ''
    switch (schedule.kind) {
      case 'cron': return schedule.expr ?? ''
      case 'every': {
        const ms = schedule.everyMs ?? 0
        if (ms >= 3600000) return `every ${ms / 3600000}h`
        if (ms >= 60000) return `every ${ms / 60000}m`
        return `every ${ms / 1000}s`
      }
      case 'at': return schedule.at ? new Date(schedule.at).toLocaleString() : ''
      default: return ''
    }
  }

  private statusDot(job: CronJob) {
    const status = job.state?.lastRunStatus
    const color = job.enabled
      ? (status === 'error' ? 'var(--danger, #e53e3e)' : 'var(--ok, #38a169)')
      : 'var(--warn, #d69e2e)'
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
                      ${job.name ?? job.id}
                    </div>
                    <div style="font-size:12px; color:var(--muted); margin-top:2px;">
                      ${this.formatSchedule(job.schedule)}
                    </div>
                  </div>

                  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-size:12px; color:var(--muted); flex-shrink:0; margin-right:8px;">
                    <span>Last: ${this.formatTime(job.state?.lastRunAtMs)}${job.state?.lastRunStatus ? html` <span style="color:${job.state.lastRunStatus === 'error' ? 'var(--danger, #e53e3e)' : 'var(--ok, #38a169)'}">${job.state.lastRunStatus}</span>` : nothing}</span>
                    ${job.state?.nextRunAtMs ? html`<span>Next: ${this.formatTime(job.state.nextRunAtMs)}</span>` : nothing}
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
