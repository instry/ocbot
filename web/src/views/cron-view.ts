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

  private async loadRuns(jobId: string) {
    if (this.expandedJobId === jobId) {
      this.expandedJobId = null
      this.runs = []
      return
    }
    this.expandedJobId = jobId
    this.runsLoading = true
    try {
      const result = await this.gateway.call<{ entries?: CronRunEntry[] }>('cron.runs', {
        id: jobId,
        limit: 10,
        sortDir: 'desc',
      })
      this.runs = result?.entries ?? []
    } catch {
      this.runs = []
    } finally {
      this.runsLoading = false
    }
  }

  private renderRuns(jobId: string) {
    if (this.expandedJobId !== jobId) return nothing

    if (this.runsLoading) {
      return html`<div style="padding:8px 16px; font-size:12px; color:var(--muted);">Loading history...</div>`
    }

    if (this.runs.length === 0) {
      return html`<div style="padding:8px 16px; font-size:12px; color:var(--muted);">No run history</div>`
    }

    return html`
      <div style="padding:8px 16px 4px; border-top:1px solid var(--border); margin-top:8px;">
        <div style="font-size:11px; font-weight:500; color:var(--muted); margin-bottom:6px;">Recent Runs</div>
        ${this.runs.map(run => html`
          <div style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12px;">
            <span style="color:${run.status === 'error' ? 'var(--danger, #e53e3e)' : run.status === 'ok' ? 'var(--ok, #38a169)' : 'var(--muted)'};">
              ${run.status === 'ok' ? '\u2713' : run.status === 'error' ? '\u2717' : '\u2014'}
            </span>
            <span style="color:var(--muted); flex-shrink:0;">${this.formatTime(run.ranAtMs)}</span>
            ${run.durationMs ? html`<span style="color:var(--muted);">${(run.durationMs / 1000).toFixed(1)}s</span>` : nothing}
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text);">
              ${run.error ?? run.summary ?? ''}
            </span>
          </div>
        `)}
      </div>
    `
  }

  private openEditForm(job: CronJob) {
    this.formOpen = true
    this.formMode = 'edit'
    this.formEditId = job.id
    this.formName = job.name ?? ''
    this.formScheduleKind = job.schedule?.kind ?? 'cron'
    switch (job.schedule?.kind) {
      case 'cron': this.formScheduleValue = job.schedule.expr ?? ''; break
      case 'every': {
        const ms = job.schedule.everyMs ?? 0
        if (ms >= 3600000) this.formScheduleValue = `${ms / 3600000}h`
        else this.formScheduleValue = `${ms / 60000}m`
        break
      }
      case 'at': this.formScheduleValue = job.schedule.at ?? ''; break
      default: this.formScheduleValue = ''
    }
    const p = job.payload
    this.formMessage = p?.kind === 'agentTurn' ? (p.message ?? '') : (p?.text ?? '')
  }

  private async removeJob(id: string) {
    try {
      await this.gateway.call('cron.remove', { id })
      this.confirmDeleteId = null
      await this.loadJobs()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  private openCreateForm() {
    this.formOpen = true
    this.formMode = 'create'
    this.formEditId = null
    this.formName = ''
    this.formScheduleKind = 'cron'
    this.formScheduleValue = ''
    this.formMessage = ''
  }

  private closeForm() {
    this.formOpen = false
    this.formSaving = false
  }

  private buildSchedule(): CronSchedule {
    switch (this.formScheduleKind) {
      case 'cron': return { kind: 'cron', expr: this.formScheduleValue }
      case 'every': return { kind: 'every', everyMs: this.parseInterval(this.formScheduleValue) }
      case 'at': return { kind: 'at', at: this.formScheduleValue }
    }
  }

  private parseInterval(value: string): number {
    const num = parseFloat(value)
    if (value.endsWith('h')) return num * 3600000
    if (value.endsWith('s')) return num * 1000
    // default: minutes
    return num * 60000
  }

  private async saveJob() {
    if (!this.formName.trim() || !this.formMessage.trim()) return
    this.formSaving = true
    try {
      if (this.formMode === 'create') {
        await this.gateway.call('cron.add', {
          name: this.formName.trim(),
          schedule: this.buildSchedule(),
          payload: { kind: 'agentTurn', message: this.formMessage.trim() },
          sessionTarget: 'isolated',
          wakeMode: 'now',
          enabled: true,
        })
      } else if (this.formEditId) {
        await this.gateway.call('cron.update', {
          id: this.formEditId,
          patch: {
            name: this.formName.trim(),
            schedule: this.buildSchedule(),
            payload: { kind: 'agentTurn', message: this.formMessage.trim() },
          },
        })
      }
      this.closeForm()
      await this.loadJobs()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.formSaving = false
    }
  }

  private renderForm() {
    if (!this.formOpen) return nothing

    const inputStyle = `
      width:100%; padding:8px 10px; border:1px solid var(--border);
      border-radius:6px; background:var(--bg); color:var(--text);
      font-size:13px; outline:none;
    `
    const labelStyle = `font-size:12px; font-weight:500; color:var(--muted); margin-bottom:4px;`

    return html`
      <div style="
        padding:16px; margin-bottom:12px;
        border:1px solid var(--accent, #7c3aed);
        border-radius:8px; background:var(--surface, var(--bg));
      ">
        <div style="font-weight:600; color:var(--text-strong); margin-bottom:12px;">
          ${this.formMode === 'create' ? 'New Task' : 'Edit Task'}
        </div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          <!-- Name -->
          <div>
            <div style="${labelStyle}">Name</div>
            <input
              style="${inputStyle}"
              placeholder="e.g. Morning report"
              .value=${this.formName}
              @input=${(e: Event) => { this.formName = (e.target as HTMLInputElement).value }}
            />
          </div>

          <!-- Schedule type + value -->
          <div>
            <div style="${labelStyle}">Schedule</div>
            <div style="display:flex; gap:8px;">
              <select
                style="padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font-size:13px;"
                .value=${this.formScheduleKind}
                @change=${(e: Event) => {
                  this.formScheduleKind = (e.target as HTMLSelectElement).value as ScheduleKind
                  this.formScheduleValue = ''
                }}
              >
                <option value="cron">Cron</option>
                <option value="every">Interval</option>
                <option value="at">One-time</option>
              </select>
              <input
                style="${inputStyle} flex:1;"
                placeholder=${this.formScheduleKind === 'cron' ? '0 9 * * *'
                  : this.formScheduleKind === 'every' ? '30m (or 2h, 60s)'
                  : '2026-04-01T09:00'}
                .value=${this.formScheduleValue}
                @input=${(e: Event) => { this.formScheduleValue = (e.target as HTMLInputElement).value }}
              />
            </div>
          </div>

          <!-- Message -->
          <div>
            <div style="${labelStyle}">Prompt</div>
            <textarea
              style="${inputStyle} min-height:60px; resize:vertical; font-family:inherit;"
              placeholder="What should the AI do?"
              .value=${this.formMessage}
              @input=${(e: Event) => { this.formMessage = (e.target as HTMLTextAreaElement).value }}
            ></textarea>
          </div>

          <!-- Actions -->
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">
            <button class="btn btn--sm" @click=${() => this.closeForm()}>Cancel</button>
            <button
              class="btn btn--sm"
              style="background:var(--accent, #7c3aed); color:var(--accent-foreground, #fff); border-color:var(--accent, #7c3aed);"
              ?disabled=${this.formSaving || !this.formName.trim() || !this.formScheduleValue.trim() || !this.formMessage.trim()}
              @click=${() => this.saveJob()}
            >${this.formSaving ? 'Saving...' : (this.formMode === 'create' ? 'Create' : 'Save')}</button>
          </div>
        </div>
      </div>
    `
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:center; margin-bottom:20px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Scheduled Tasks</h2>
          <span style="flex:1"></span>
          <button class="btn btn--sm" @click=${() => this.openCreateForm()} title="New task"
            style="margin-right:8px;"
          >+ New</button>
          <button class="btn btn--sm" @click=${() => this.loadJobs()} title="Refresh">Refresh</button>
        </div>

        ${this.renderForm()}

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
                cursor:pointer;
              " @click=${() => this.openEditForm(job)}>
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
                    <button
                      class="btn btn--sm"
                      @click=${(e: Event) => { e.stopPropagation(); this.loadRuns(job.id) }}
                      title="Run history"
                      style="min-width:32px; padding:4px 8px;"
                    >&#128203;</button>
                    ${this.confirmDeleteId === job.id ? html`
                      <button
                        class="btn btn--sm btn--danger"
                        @click=${(e: Event) => { e.stopPropagation(); this.removeJob(job.id) }}
                        style="min-width:32px; padding:4px 8px;"
                        title="Confirm delete"
                      >Yes</button>
                      <button
                        class="btn btn--sm"
                        @click=${(e: Event) => { e.stopPropagation(); this.confirmDeleteId = null }}
                        style="min-width:32px; padding:4px 8px;"
                      >No</button>
                    ` : html`
                      <button
                        class="btn btn--sm"
                        @click=${(e: Event) => { e.stopPropagation(); this.confirmDeleteId = job.id }}
                        title="Delete"
                        style="min-width:32px; padding:4px 8px; color:var(--danger, #e53e3e);"
                      >&#128465;</button>
                    `}
                  </div>
                </div>
                ${this.renderRuns(job.id)}
              </div>
            `)}
          </div>
        `}
      </div>
    `
  }
}
