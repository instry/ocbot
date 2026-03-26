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
type SimpleScheduleMode = 'daily' | 'weekdays' | 'weekly' | 'every-hours' | 'every-days' | 'once' | 'advanced'

const WEEKDAY_OPTIONS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
] as const

const SIMPLE_SCHEDULE_OPTIONS: Array<{ value: SimpleScheduleMode; label: string; hint: string }> = [
  { value: 'daily', label: 'Every day', hint: 'Run once each day' },
  { value: 'weekdays', label: 'Weekdays', hint: 'Only Monday to Friday' },
  { value: 'weekly', label: 'Every week', hint: 'Pick one day each week' },
  { value: 'every-hours', label: 'Every few hours', hint: 'Repeat throughout the day' },
  { value: 'every-days', label: 'Every few days', hint: 'Repeat every N days' },
  { value: 'once', label: 'One time', hint: 'Run at a specific date and time' },
  { value: 'advanced', label: 'Advanced', hint: 'Use a cron expression' },
] as const

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
  @state() private formScheduleMode: SimpleScheduleMode = 'daily'
  @state() private formTime = '09:00'
  @state() private formWeekday = '1'
  @state() private formEveryValue = '1'
  @state() private formDateTime = ''
  @state() private formAdvancedCron = '0 9 * * *'
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
      case 'cron': {
        const expr = schedule.expr?.trim() ?? ''
        const daily = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
        if (daily) return `Every day at ${this.formatClockTime(daily[2], daily[1])}`

        if (/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(1-5|1,2,3,4,5)$/.test(expr)) {
          const [, minute, hour] = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(1-5|1,2,3,4,5)$/) ?? []
          return `Every weekday at ${this.formatClockTime(hour, minute)}`
        }

        const weekly = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-6])$/)
        if (weekly) {
          const day = WEEKDAY_OPTIONS.find(option => option.value === weekly[3])?.label ?? 'Selected day'
          return `Every ${day} at ${this.formatClockTime(weekly[2], weekly[1])}`
        }

        return `Custom schedule · ${expr}`
      }
      case 'every': {
        const ms = schedule.everyMs ?? 0
        if (ms % 86400000 === 0) {
          const days = ms / 86400000
          return days === 1 ? 'Every day' : `Every ${days} days`
        }
        if (ms % 3600000 === 0) {
          const hours = ms / 3600000
          return hours === 1 ? 'Every hour' : `Every ${hours} hours`
        }
        if (ms >= 60000) return `Every ${ms / 60000} minutes`
        return `Every ${ms / 1000} seconds`
      }
      case 'at': return schedule.at ? `Once on ${new Date(schedule.at).toLocaleString()}` : ''
      default: return ''
    }
  }

  private formatClockTime(hour: string | number, minute: string | number) {
    return new Date(2000, 0, 1, Number(hour), Number(minute)).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
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
            <span style="color:${run.status === 'error' ? 'var(--danger, #e53e3e)' : run.status === 'ok' ? 'var(--ok, #38a169)' : 'var(--muted)'}; display:inline-flex; align-items:center;">
              ${run.status === 'ok'
                ? svgIcon('circle-check', 16)
                : run.status === 'error'
                  ? svgIcon('circle-x', 16)
                  : svgIcon('circle-dot', 16)}
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
    this.applyScheduleToForm(job.schedule)
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
    this.formScheduleMode = 'daily'
    this.formTime = '09:00'
    this.formWeekday = '1'
    this.formEveryValue = '1'
    this.formDateTime = this.toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000))
    this.formAdvancedCron = '0 9 * * *'
    this.formMessage = ''
  }

  private closeForm() {
    this.formOpen = false
    this.formSaving = false
  }

  private applyScheduleToForm(schedule?: CronSchedule) {
    this.formScheduleMode = 'daily'
    this.formTime = '09:00'
    this.formWeekday = '1'
    this.formEveryValue = '1'
    this.formDateTime = this.toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000))
    this.formAdvancedCron = '0 9 * * *'

    if (!schedule) return

    if (schedule.kind === 'at' && schedule.at) {
      this.formScheduleMode = 'once'
      this.formDateTime = this.toLocalDateTimeInputValue(new Date(schedule.at))
      return
    }

    if (schedule.kind === 'every') {
      const ms = schedule.everyMs ?? 0
      if (ms >= 86400000 && ms % 86400000 === 0) {
        this.formScheduleMode = 'every-days'
        this.formEveryValue = String(ms / 86400000)
        return
      }
      this.formScheduleMode = 'every-hours'
      this.formEveryValue = String(Math.max(ms / 3600000, 1))
      return
    }

    if (schedule.kind === 'cron') {
      const expr = schedule.expr?.trim() ?? ''
      this.formAdvancedCron = expr || '0 9 * * *'

      const daily = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
      if (daily) {
        this.formScheduleMode = 'daily'
        this.formTime = `${String(Number(daily[2])).padStart(2, '0')}:${String(Number(daily[1])).padStart(2, '0')}`
        return
      }

      const weekdays = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(1-5|1,2,3,4,5)$/)
      if (weekdays) {
        this.formScheduleMode = 'weekdays'
        this.formTime = `${String(Number(weekdays[2])).padStart(2, '0')}:${String(Number(weekdays[1])).padStart(2, '0')}`
        return
      }

      const weekly = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-6])$/)
      if (weekly) {
        this.formScheduleMode = 'weekly'
        this.formWeekday = weekly[3]
        this.formTime = `${String(Number(weekly[2])).padStart(2, '0')}:${String(Number(weekly[1])).padStart(2, '0')}`
        return
      }

      this.formScheduleMode = 'advanced'
    }
  }

  private toLocalDateTimeInputValue(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  private buildCronFromTime(dayExpr: string) {
    const [hourRaw = '09', minuteRaw = '00'] = this.formTime.split(':')
    const hour = Number(hourRaw)
    const minute = Number(minuteRaw)
    return `${minute} ${hour} * * ${dayExpr}`
  }

  private buildSchedule(): CronSchedule {
    switch (this.formScheduleMode) {
      case 'daily':
        return { kind: 'cron', expr: this.buildCronFromTime('*') }
      case 'weekdays':
        return { kind: 'cron', expr: this.buildCronFromTime('1-5') }
      case 'weekly':
        return { kind: 'cron', expr: this.buildCronFromTime(this.formWeekday) }
      case 'every-hours':
        return { kind: 'every', everyMs: Math.max(Number(this.formEveryValue) || 1, 1) * 3600000 }
      case 'every-days':
        return { kind: 'every', everyMs: Math.max(Number(this.formEveryValue) || 1, 1) * 86400000 }
      case 'once':
        return { kind: 'at', at: new Date(this.formDateTime).toISOString() }
      case 'advanced':
        return { kind: 'cron', expr: this.formAdvancedCron.trim() }
    }
  }

  private getSchedulePreview() {
    return this.formatSchedule(this.buildSchedule())
  }

  private canSaveForm() {
    if (!this.formName.trim() || !this.formMessage.trim()) return false
    switch (this.formScheduleMode) {
      case 'daily':
      case 'weekdays':
        return Boolean(this.formTime)
      case 'weekly':
        return Boolean(this.formTime && this.formWeekday)
      case 'every-hours':
      case 'every-days':
        return Number(this.formEveryValue) > 0
      case 'once':
        return Boolean(this.formDateTime)
      case 'advanced':
        return Boolean(this.formAdvancedCron.trim())
    }
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

  private getJobPrompt(job: CronJob) {
    return job.payload?.kind === 'agentTurn'
      ? (job.payload.message ?? '')
      : (job.payload?.text ?? '')
  }

  private renderForm() {
    if (!this.formOpen) return nothing

    const inputStyle = `
      width:100%; padding:10px 12px; border:1px solid var(--border);
      border-radius:var(--radius-md); background:var(--bg); color:var(--text-strong);
      font-size:13px; outline:none;
    `
    const labelStyle = `font-size:12px; font-weight:500; color:var(--muted); margin-bottom:6px;`

    return html`
      <div style="
        padding:18px; margin-bottom:16px;
        border:1px solid var(--border);
        border-radius:var(--radius-lg); background:var(--card);
        box-shadow:var(--shadow-sm, none);
      ">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
          <div>
            <div style="font-weight:600; color:var(--text-strong);">
              ${this.formMode === 'create' ? 'Create automation' : 'Edit automation'}
            </div>
            <div style="margin-top:4px; font-size:13px; color:var(--muted); line-height:1.5;">
              Use plain language to decide what OCBot should do and when it should happen.
            </div>
          </div>
          <button class="btn btn--sm" @click=${() => this.closeForm()}>Close</button>
        </div>

        <div style="display:flex; flex-direction:column; gap:14px;">
          <div>
            <div style="${labelStyle}">What should this automation be called?</div>
            <input
              style="${inputStyle}"
              placeholder="Morning summary"
              .value=${this.formName}
              @input=${(e: Event) => { this.formName = (e.target as HTMLInputElement).value }}
            />
          </div>

          <div>
            <div style="${labelStyle}">When should it run?</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px;">
              ${SIMPLE_SCHEDULE_OPTIONS.map(option => {
                const active = this.formScheduleMode === option.value
                return html`
                  <button
                    style="
                      display:flex; flex-direction:column; align-items:flex-start; gap:4px;
                      padding:12px; border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};
                      border-radius:var(--radius-lg); background:${active ? 'var(--accent-subtle)' : 'var(--bg)'};
                      color:${active ? 'var(--text-strong)' : 'var(--text)'}; cursor:pointer; text-align:left;
                    "
                    @click=${() => { this.formScheduleMode = option.value }}
                  >
                    <span style="font-size:13px; font-weight:600;">${option.label}</span>
                    <span style="font-size:12px; color:var(--muted); line-height:1.4;">${option.hint}</span>
                  </button>
                `
              })}
            </div>
          </div>

          ${this.formScheduleMode === 'daily' || this.formScheduleMode === 'weekdays' ? html`
            <div>
              <div style="${labelStyle}">Time</div>
              <input
                type="time"
                style="${inputStyle}; max-width:220px;"
                .value=${this.formTime}
                @input=${(e: Event) => { this.formTime = (e.target as HTMLInputElement).value }}
              />
            </div>
          ` : nothing}

          ${this.formScheduleMode === 'weekly' ? html`
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <div style="min-width:180px; flex:1;">
                <div style="${labelStyle}">Day</div>
                <select
                  style="${inputStyle}"
                  .value=${this.formWeekday}
                  @change=${(e: Event) => { this.formWeekday = (e.target as HTMLSelectElement).value }}
                >
                  ${WEEKDAY_OPTIONS.map(option => html`<option value=${option.value}>${option.label}</option>`)}
                </select>
              </div>
              <div style="min-width:180px; flex:1;">
                <div style="${labelStyle}">Time</div>
                <input
                  type="time"
                  style="${inputStyle}"
                  .value=${this.formTime}
                  @input=${(e: Event) => { this.formTime = (e.target as HTMLInputElement).value }}
                />
              </div>
            </div>
          ` : nothing}

          ${this.formScheduleMode === 'every-hours' || this.formScheduleMode === 'every-days' ? html`
            <div>
              <div style="${labelStyle}">
                ${this.formScheduleMode === 'every-hours' ? 'Repeat every how many hours?' : 'Repeat every how many days?'}
              </div>
              <input
                type="number"
                min="1"
                step="1"
                style="${inputStyle}; max-width:220px;"
                .value=${this.formEveryValue}
                @input=${(e: Event) => { this.formEveryValue = (e.target as HTMLInputElement).value }}
              />
            </div>
          ` : nothing}

          ${this.formScheduleMode === 'once' ? html`
            <div>
              <div style="${labelStyle}">Date and time</div>
              <input
                type="datetime-local"
                style="${inputStyle}; max-width:280px;"
                .value=${this.formDateTime}
                @input=${(e: Event) => { this.formDateTime = (e.target as HTMLInputElement).value }}
              />
            </div>
          ` : nothing}

          ${this.formScheduleMode === 'advanced' ? html`
            <div>
              <div style="${labelStyle}">Cron expression</div>
              <input
                style="${inputStyle}"
                placeholder="0 9 * * *"
                .value=${this.formAdvancedCron}
                @input=${(e: Event) => { this.formAdvancedCron = (e.target as HTMLInputElement).value }}
              />
              <div style="margin-top:6px; font-size:12px; color:var(--muted);">
                Use advanced mode only if the simple options do not fit.
              </div>
            </div>
          ` : nothing}

          <div>
            <div style="${labelStyle}">What should OCBot do?</div>
            <textarea
              style="${inputStyle}; min-height:84px; resize:vertical; font-family:inherit;"
              placeholder="Summarize unread emails and list anything urgent."
              .value=${this.formMessage}
              @input=${(e: Event) => { this.formMessage = (e.target as HTMLTextAreaElement).value }}
            ></textarea>
          </div>

          <div style="padding:12px 14px; border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg);">
            <div style="font-size:12px; font-weight:500; color:var(--muted); margin-bottom:6px;">Preview</div>
            <div style="font-size:14px; color:var(--text-strong);">${this.getSchedulePreview()}</div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:2px;">
            <button class="btn btn--sm" @click=${() => this.closeForm()}>Cancel</button>
            <button
              class="btn btn--sm"
              style="background:var(--accent, #7c3aed); color:var(--accent-foreground, #fff); border-color:var(--accent, #7c3aed);"
              ?disabled=${this.formSaving || !this.canSaveForm()}
              @click=${() => this.saveJob()}
            >${this.formSaving ? 'Saving...' : (this.formMode === 'create' ? 'Create automation' : 'Save changes')}</button>
          </div>
        </div>
      </div>
    `
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; overflow-y:auto;">
        <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:20px;">
          <div>
            <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Automations</h2>
            <div style="margin-top:6px; font-size:13px; color:var(--muted); line-height:1.5;">
              Ask OCBot to do something on a schedule, without writing cron syntax.
            </div>
          </div>
          <span style="flex:1"></span>
          <button class="btn btn--sm" @click=${() => this.openCreateForm()} title="Create automation"
            style="margin-right:8px;"
          >+ Create</button>
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
            <div style="font-size:15px; color:var(--text-strong);">No automations yet</div>
            <div style="margin-top:8px; font-size:13px; line-height:1.6;">
              Create one for things like a morning summary, a weekly check-in, or a reminder.
            </div>
          </div>
        ` : html`
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${this.jobs.map(job => html`
              <div style="
                padding:14px 16px;
                border:1px solid var(--border);
                border-radius:var(--radius-lg);
                background:var(--card);
                cursor:pointer;
                box-shadow:var(--shadow-sm, none);
              " @click=${() => this.openEditForm(job)}>
                <div style="display:flex; align-items:flex-start; gap:12px;">
                  ${this.statusDot(job)}
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:500; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                      ${job.name ?? job.id}
                    </div>
                    <div style="font-size:12px; color:var(--muted); margin-top:4px;">
                      ${this.formatSchedule(job.schedule)}
                    </div>
                    ${this.getJobPrompt(job) ? html`
                      <div style="font-size:13px; color:var(--text); margin-top:10px; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                        ${this.getJobPrompt(job)}
                      </div>
                    ` : nothing}
                  </div>

                  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; font-size:12px; color:var(--muted); flex-shrink:0; margin-right:8px;">
                    <span>${job.enabled ? 'Active' : 'Paused'}</span>
                    ${job.state?.nextRunAtMs ? html`<span>Next ${this.formatTime(job.state.nextRunAtMs)}</span>` : nothing}
                    <span>Last ${this.formatTime(job.state?.lastRunAtMs)}${job.state?.lastRunStatus ? html` <span style="color:${job.state.lastRunStatus === 'error' ? 'var(--danger, #e53e3e)' : 'var(--ok, #38a169)'}">${job.state.lastRunStatus}</span>` : nothing}</span>
                  </div>

                  <div style="display:flex; gap:6px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end;">
                    <button
                      class="btn btn--sm"
                      @click=${(e: Event) => this.runJob(job.id, e)}
                      title="Run now"
                    >Run now</button>
                    <button
                      class="btn btn--sm"
                      @click=${(e: Event) => this.toggleJob(job, e)}
                      title=${job.enabled ? 'Pause' : 'Resume'}
                      style="color:${job.enabled ? 'var(--ok, #38a169)' : 'var(--muted)'};"
                    >${job.enabled ? 'Pause' : 'Resume'}</button>
                    <button
                      class="btn btn--sm"
                      @click=${(e: Event) => { e.stopPropagation(); this.loadRuns(job.id) }}
                      title="Run history"
                    >History</button>
                    ${this.confirmDeleteId === job.id ? html`
                      <button
                        class="btn btn--sm btn--danger"
                        @click=${(e: Event) => { e.stopPropagation(); this.removeJob(job.id) }}
                        title="Confirm delete"
                      >Yes</button>
                      <button
                        class="btn btn--sm"
                        @click=${(e: Event) => { e.stopPropagation(); this.confirmDeleteId = null }}
                      >No</button>
                    ` : html`
                      <button
                        class="btn btn--sm"
                        @click=${(e: Event) => { e.stopPropagation(); this.confirmDeleteId = job.id }}
                        title="Delete"
                        style="color:var(--danger, #e53e3e);"
                      >Delete</button>
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
