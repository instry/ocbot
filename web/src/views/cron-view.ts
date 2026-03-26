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
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
] as const

const SCHEDULE_PILLS: Array<{ value: SimpleScheduleMode; label: string }> = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every-hours', label: 'Every N hours' },
  { value: 'every-days', label: 'Every N days' },
  { value: 'once', label: 'One time' },
  { value: 'advanced', label: 'Advanced' },
]

@customElement('ocbot-cron-view')
export class OcbotCronView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() jobs: CronJob[] = []
  @state() loading = true
  @state() error: string | null = null

  @state() private selectedJobId: string | null = null
  @state() private formMode: FormMode = 'edit'
  @state() private formName = ''
  @state() private formScheduleMode: SimpleScheduleMode = 'daily'
  @state() private formTime = '09:00'
  @state() private formWeekday = '1'
  @state() private formEveryValue = '1'
  @state() private formDateTime = ''
  @state() private formAdvancedCron = '0 9 * * *'
  @state() private formMessage = ''
  @state() private formSaving = false

  @state() private panelOpen = false
  @state() private historyOpen = false
  @state() private runs: CronRunEntry[] = []
  @state() private runsLoading = false

  @state() private confirmDelete = false

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

  // ── Data ──────────────────────────────────────────

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

  private async runJob(id: string) {
    try {
      await this.gateway.call('cron.run', { id })
      await this.loadRuns(id)
    } catch { /* best effort */ }
  }

  private async toggleJob(job: CronJob) {
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

  private async removeJob(id: string) {
    try {
      await this.gateway.call('cron.remove', { id })
      this.closePanel()
      await this.loadJobs()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
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
      } else if (this.selectedJobId) {
        await this.gateway.call('cron.update', {
          id: this.selectedJobId,
          patch: {
            name: this.formName.trim(),
            schedule: this.buildSchedule(),
            payload: { kind: 'agentTurn', message: this.formMessage.trim() },
          },
        })
      }
      this.formSaving = false
      if (this.formMode === 'create') {
        this.closePanel()
      }
      await this.loadJobs()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.formSaving = false
    }
  }

  private async loadRuns(jobId: string) {
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

  // ── Form helpers ──────────────────────────────────

  private selectJob(job: CronJob) {
    this.selectedJobId = job.id
    this.formMode = 'edit'
    this.panelOpen = true
    this.confirmDelete = false
    this.historyOpen = false
    this.formName = job.name ?? ''
    this.applyScheduleToForm(job.schedule)
    const p = job.payload
    this.formMessage = p?.kind === 'agentTurn' ? (p.message ?? '') : (p?.text ?? '')
    this.runs = []
  }

  private openCreate() {
    this.selectedJobId = null
    this.formMode = 'create'
    this.panelOpen = true
    this.confirmDelete = false
    this.historyOpen = false
    this.formName = ''
    this.formScheduleMode = 'daily'
    this.formTime = '09:00'
    this.formWeekday = '1'
    this.formEveryValue = '1'
    this.formDateTime = this.toLocalDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000))
    this.formAdvancedCron = '0 9 * * *'
    this.formMessage = ''
    this.runs = []
  }

  private closePanel() {
    this.panelOpen = false
    this.selectedJobId = null
    this.formSaving = false
    this.confirmDelete = false
    this.historyOpen = false
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
    return `${Number(minuteRaw)} ${Number(hourRaw)} * * ${dayExpr}`
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

  // ── Format helpers ────────────────────────────────

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
          return `Weekdays at ${this.formatClockTime(hour, minute)}`
        }

        const weekly = expr.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-6])$/)
        if (weekly) {
          const day = WEEKDAY_OPTIONS.find(o => o.value === weekly[3])?.label ?? 'day'
          return `${day} at ${this.formatClockTime(weekly[2], weekly[1])}`
        }

        return expr
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
        if (ms >= 60000) return `Every ${ms / 60000} min`
        return `Every ${ms / 1000}s`
      }
      case 'at': return schedule.at ? `Once: ${new Date(schedule.at).toLocaleString()}` : ''
      default: return ''
    }
  }

  private formatClockTime(hour: string | number, minute: string | number) {
    return new Date(2000, 0, 1, Number(hour), Number(minute)).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  private getSchedulePreview() {
    return this.formatSchedule(this.buildSchedule())
  }

  private statusDot(job: CronJob) {
    const status = job.state?.lastRunStatus
    const color = job.enabled
      ? (status === 'error' ? 'var(--danger, #e53e3e)' : 'var(--ok, #38a169)')
      : 'var(--warn, #d69e2e)'
    return html`<span style="
      display:inline-block; width:8px; height:8px; border-radius:50%;
      background:${color}; flex-shrink:0; margin-top:5px;
    "></span>`
  }

  private getJobPrompt(job: CronJob) {
    return job.payload?.kind === 'agentTurn'
      ? (job.payload.message ?? '')
      : (job.payload?.text ?? '')
  }

  // ── Render: Job list (left column) ────────────────

  private renderList() {
    if (this.loading) {
      return html`<div style="text-align:center; color:var(--muted); padding:40px;">Loading...</div>`
    }
    if (this.error) {
      return html`<div style="text-align:center; color:var(--danger); padding:40px;">${this.error}</div>`
    }
    if (this.jobs.length === 0) {
      return html`
        <div style="text-align:center; color:var(--muted); padding:60px 20px;">
          <div style="margin-bottom:12px;">${svgIcon('calendar', 36)}</div>
          <div style="font-size:15px; color:var(--text-strong);">No automations yet</div>
          <div style="margin-top:8px; font-size:13px; line-height:1.6;">
            Create one for things like a morning summary, a weekly check-in, or a reminder.
          </div>
        </div>
      `
    }

    return html`
      <div style="display:flex; flex-direction:column; gap:4px;">
        ${this.jobs.map(job => {
          const selected = this.selectedJobId === job.id && this.panelOpen
          return html`
            <div
              style="
                padding:10px 14px; cursor:pointer;
                border:1px solid ${selected ? 'var(--accent, #7c3aed)' : 'var(--border)'};
                border-radius:var(--radius-md);
                background:${selected ? 'var(--accent-subtle, rgba(124,58,237,0.06))' : 'var(--card)'};
                transition:border-color 0.15s, background 0.15s;
              "
              @click=${() => this.selectJob(job)}
            >
              <div style="display:flex; align-items:flex-start; gap:10px;">
                ${this.statusDot(job)}
                <div style="flex:1; min-width:0;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:500; font-size:13px; color:var(--text-strong); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
                      ${job.name ?? job.id}
                    </span>
                    <span style="
                      font-size:11px; padding:2px 8px; border-radius:999px; flex-shrink:0;
                      background:${job.enabled ? 'var(--ok-subtle, rgba(56,161,105,0.1))' : 'var(--warn-subtle, rgba(214,158,46,0.1))'};
                      color:${job.enabled ? 'var(--ok, #38a169)' : 'var(--warn, #d69e2e)'};
                    ">${job.enabled ? 'Active' : 'Paused'}</span>
                  </div>
                  <div style="font-size:12px; color:var(--muted); margin-top:3px;">
                    ${this.formatSchedule(job.schedule)}
                  </div>
                </div>
              </div>
            </div>
          `
        })}
      </div>
    `
  }

  // ── Render: Side panel (right column) ─────────────

  private renderPanel() {
    if (!this.panelOpen) return nothing

    const inputStyle = `
      width:100%; padding:8px 10px; border:1px solid var(--border);
      border-radius:var(--radius-md); background:var(--bg); color:var(--text-strong);
      font-size:13px; outline:none; box-sizing:border-box;
    `
    const labelStyle = `font-size:12px; font-weight:500; color:var(--muted); margin-bottom:5px;`
    const isEdit = this.formMode === 'edit'
    const currentJob = isEdit ? this.jobs.find(j => j.id === this.selectedJobId) : null

    return html`
      <div style="
        width:360px; min-width:360px; height:100%; overflow-y:auto;
        border-left:1px solid var(--border); background:var(--card);
        display:flex; flex-direction:column;
      ">
        <!-- Header -->
        <div style="
          display:flex; align-items:center; justify-content:space-between;
          padding:16px 18px 12px; border-bottom:1px solid var(--border);
        ">
          <span style="font-weight:600; font-size:14px; color:var(--text-strong);">
            ${isEdit ? 'Edit automation' : 'New automation'}
          </span>
          <button
            class="btn btn--sm"
            style="padding:2px 8px; font-size:12px;"
            @click=${() => this.closePanel()}
          >${svgIcon('x', 14)}</button>
        </div>

        <!-- Form -->
        <div style="padding:16px 18px; display:flex; flex-direction:column; gap:14px; flex:1; overflow-y:auto;">
          <!-- Name -->
          <div>
            <div style="${labelStyle}">Name</div>
            <input
              style="${inputStyle}"
              placeholder="Morning summary"
              .value=${this.formName}
              @input=${(e: Event) => { this.formName = (e.target as HTMLInputElement).value }}
            />
          </div>

          <!-- Schedule pills -->
          <div>
            <div style="${labelStyle}">Schedule</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${SCHEDULE_PILLS.map(pill => {
                const active = this.formScheduleMode === pill.value
                return html`
                  <button
                    style="
                      padding:5px 12px; border-radius:999px; font-size:12px; cursor:pointer;
                      border:1px solid ${active ? 'var(--accent, #7c3aed)' : 'var(--border)'};
                      background:${active ? 'var(--accent, #7c3aed)' : 'transparent'};
                      color:${active ? 'var(--accent-foreground, #fff)' : 'var(--text)'};
                      transition:all 0.15s;
                    "
                    @click=${() => { this.formScheduleMode = pill.value }}
                  >${pill.label}</button>
                `
              })}
            </div>
          </div>

          <!-- Conditional fields -->
          ${this.formScheduleMode === 'daily' || this.formScheduleMode === 'weekdays' ? html`
            <div>
              <div style="${labelStyle}">Time</div>
              <input
                type="time"
                style="${inputStyle} max-width:160px;"
                .value=${this.formTime}
                @input=${(e: Event) => { this.formTime = (e.target as HTMLInputElement).value }}
              />
            </div>
          ` : nothing}

          ${this.formScheduleMode === 'weekly' ? html`
            <div style="display:flex; gap:8px;">
              <div style="flex:1;">
                <div style="${labelStyle}">Day</div>
                <select
                  style="${inputStyle}"
                  .value=${this.formWeekday}
                  @change=${(e: Event) => { this.formWeekday = (e.target as HTMLSelectElement).value }}
                >
                  ${WEEKDAY_OPTIONS.map(o => html`<option value=${o.value}>${o.label}</option>`)}
                </select>
              </div>
              <div style="flex:1;">
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
                Every how many ${this.formScheduleMode === 'every-hours' ? 'hours' : 'days'}?
              </div>
              <input
                type="number"
                min="1"
                step="1"
                style="${inputStyle} max-width:120px;"
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
                style="${inputStyle} max-width:240px;"
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
            </div>
          ` : nothing}

          <!-- Prompt -->
          <div>
            <div style="${labelStyle}">What should OCBot do?</div>
            <textarea
              style="${inputStyle} min-height:72px; resize:vertical; font-family:inherit;"
              placeholder="Summarize unread emails and list anything urgent."
              .value=${this.formMessage}
              @input=${(e: Event) => { this.formMessage = (e.target as HTMLTextAreaElement).value }}
            ></textarea>
          </div>

          <!-- Schedule preview -->
          <div style="font-size:12px; color:var(--muted); padding:8px 10px; border-radius:var(--radius-md); background:var(--bg);">
            ${this.getSchedulePreview()}
          </div>

          <!-- Status info (edit mode only) -->
          ${isEdit && currentJob ? html`
            <div style="font-size:12px; color:var(--muted); display:flex; flex-direction:column; gap:3px;">
              ${currentJob.state?.nextRunAtMs ? html`<span>Next run: ${this.formatTime(currentJob.state.nextRunAtMs)}</span>` : nothing}
              <span>Last run: ${this.formatTime(currentJob.state?.lastRunAtMs)}${currentJob.state?.lastRunStatus ? html` <span style="color:${currentJob.state.lastRunStatus === 'error' ? 'var(--danger, #e53e3e)' : 'var(--ok, #38a169)'}">${currentJob.state.lastRunStatus}</span>` : nothing}</span>
            </div>
          ` : nothing}
        </div>

        <!-- Action bar -->
        <div style="
          padding:12px 18px; border-top:1px solid var(--border);
          display:flex; flex-direction:column; gap:8px;
        ">
          <!-- Primary actions -->
          <div style="display:flex; align-items:center; gap:8px;">
            ${isEdit ? html`
              ${this.confirmDelete ? html`
                <span style="font-size:12px; color:var(--danger, #e53e3e);">Delete?</span>
                <button
                  class="btn btn--sm btn--danger"
                  style="font-size:12px; padding:4px 10px;"
                  @click=${() => this.removeJob(this.selectedJobId!)}
                >Yes</button>
                <button
                  class="btn btn--sm"
                  style="font-size:12px; padding:4px 10px;"
                  @click=${() => { this.confirmDelete = false }}
                >No</button>
              ` : html`
                <button
                  class="btn btn--sm"
                  style="font-size:12px; padding:4px 10px; color:var(--danger, #e53e3e);"
                  @click=${() => { this.confirmDelete = true }}
                >Delete</button>
              `}
              <span style="flex:1;"></span>
              ${currentJob ? html`
                <button
                  class="btn btn--sm"
                  style="font-size:12px; padding:4px 10px;"
                  @click=${() => this.runJob(this.selectedJobId!)}
                  title="Run now"
                >Run now</button>
                <button
                  class="btn btn--sm"
                  style="font-size:12px; padding:4px 10px;"
                  @click=${() => this.toggleJob(currentJob)}
                >${currentJob.enabled ? 'Pause' : 'Resume'}</button>
              ` : nothing}
            ` : html`
              <span style="flex:1;"></span>
              <button
                class="btn btn--sm"
                style="font-size:12px; padding:4px 10px;"
                @click=${() => this.closePanel()}
              >Cancel</button>
            `}
            <button
              class="btn btn--sm"
              style="font-size:12px; padding:4px 12px; background:var(--accent, #7c3aed); color:var(--accent-foreground, #fff); border-color:var(--accent, #7c3aed);"
              ?disabled=${this.formSaving || !this.canSaveForm()}
              @click=${() => this.saveJob()}
            >${this.formSaving ? 'Saving...' : (isEdit ? 'Save' : 'Create')}</button>
          </div>

          <!-- Run history (edit mode only) -->
          ${isEdit && this.selectedJobId ? html`
            <button
              style="
                display:flex; align-items:center; gap:6px; width:100%;
                padding:6px 0; background:none; border:none; cursor:pointer;
                font-size:12px; color:var(--muted);
              "
              @click=${() => {
                this.historyOpen = !this.historyOpen
                if (this.historyOpen && this.runs.length === 0) {
                  this.loadRuns(this.selectedJobId!)
                }
              }}
            >
              <span style="font-size:10px;">${this.historyOpen ? '\u25BE' : '\u25B8'}</span>
              Run history${this.runs.length > 0 ? ` (${this.runs.length})` : ''}
            </button>
            ${this.historyOpen ? html`
              <div style="max-height:200px; overflow-y:auto;">
                ${this.runsLoading ? html`
                  <div style="font-size:12px; color:var(--muted); padding:4px 0;">Loading...</div>
                ` : this.runs.length === 0 ? html`
                  <div style="font-size:12px; color:var(--muted); padding:4px 0;">No history yet</div>
                ` : this.runs.map(run => html`
                  <div style="display:flex; align-items:center; gap:6px; padding:3px 0; font-size:12px;">
                    <span style="color:${run.status === 'error' ? 'var(--danger, #e53e3e)' : run.status === 'ok' ? 'var(--ok, #38a169)' : 'var(--muted)'}; display:inline-flex; align-items:center;">
                      ${run.status === 'ok'
                        ? svgIcon('circle-check', 14)
                        : run.status === 'error'
                          ? svgIcon('circle-x', 14)
                          : svgIcon('circle-dot', 14)}
                    </span>
                    <span style="color:var(--muted); flex-shrink:0;">${this.formatTime(run.ranAtMs)}</span>
                    ${run.durationMs ? html`<span style="color:var(--muted);">${(run.durationMs / 1000).toFixed(1)}s</span>` : nothing}
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text);">
                      ${run.error ?? run.summary ?? ''}
                    </span>
                  </div>
                `)}
              </div>
            ` : nothing}
          ` : nothing}
        </div>
      </div>
    `
  }

  // ── Main render ───────────────────────────────────

  override render() {
    return html`
      <div style="display:flex; height:100%; overflow:hidden;">
        <!-- Left: list -->
        <div style="flex:1; min-width:0; padding:20px; overflow-y:auto;">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <h2 style="font-size:18px; font-weight:600; color:var(--text-strong); margin:0;">Automations</h2>
            <span style="flex:1;"></span>
            <button
              class="btn btn--sm"
              style="font-size:12px;"
              @click=${() => this.openCreate()}
            >+ New</button>
          </div>
          ${this.renderList()}
        </div>

        <!-- Right: panel -->
        ${this.renderPanel()}
      </div>
    `
  }
}
