import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

interface WizardStepOption {
  value: unknown
  label: string
  hint?: string
}

interface WizardStep {
  id: string
  type: 'note' | 'select' | 'text' | 'confirm' | 'multiselect' | 'progress' | 'action'
  title?: string
  message?: string
  options?: WizardStepOption[]
  placeholder?: string
  sensitive?: boolean
}

interface WizardNextResult {
  done: boolean
  sessionId?: string
  step?: WizardStep
  status: string
  error?: string
}

@customElement('ocbot-onboarding')
export class OcbotOnboarding extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() step: WizardStep | null = null
  @state() sessionId: string | null = null
  @state() loading = false
  @state() error: string | null = null
  @state() textValue = ''
  @state() done = false

  override connectedCallback() {
    super.connectedCallback()
    this.startWizard()
  }

  private async startWizard() {
    this.loading = true
    this.error = null
    try {
      const result = await this.gateway.call<WizardNextResult>('wizard.start', {
        mode: 'configure',
      })
      this.sessionId = result.sessionId ?? null
      if (result.done) {
        this.done = true
      } else {
        this.step = result.step ?? null
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private async submitAnswer(value: unknown) {
    if (!this.sessionId || !this.step) return
    this.loading = true
    this.error = null
    try {
      const result = await this.gateway.call<WizardNextResult>('wizard.next', {
        sessionId: this.sessionId,
        answer: { stepId: this.step.id, value },
      })
      if (result.done) {
        this.done = true
        this.dispatchEvent(new CustomEvent('onboarding-complete', { bubbles: true, composed: true }))
      } else {
        this.step = result.step ?? null
        this.textValue = ''
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private async skip() {
    if (this.sessionId) {
      try {
        await this.gateway.call('wizard.cancel', { sessionId: this.sessionId })
      } catch { /* best effort */ }
    }
    this.dispatchEvent(new CustomEvent('onboarding-complete', { bubbles: true, composed: true }))
  }

  override render() {
    if (this.done) {
      return html`
        <div class="onboarding">
          <div class="onboarding__card">
            <img src="/logo.png" alt="Ocbot" style="width:64px; height:64px; margin-bottom:16px;" />
            <h1 class="onboarding__title">You're all set!</h1>
            <p class="onboarding__subtitle">Your AI provider is configured.</p>
            <button class="onboarding__btn onboarding__btn--primary" @click=${this.skip}>Get Started</button>
          </div>
        </div>
      `
    }

    return html`
      <div class="onboarding">
        <div class="onboarding__card">
          <!-- Brand -->
          <img src="/logo.png" alt="Ocbot" style="width:64px; height:64px; margin-bottom:16px;" />
          <h1 class="onboarding__title">Welcome to Ocbot</h1>

          ${this.error ? html`
            <p class="onboarding__error">${this.error}</p>
          ` : nothing}

          ${this.loading && !this.step ? html`
            <p class="onboarding__subtitle">Connecting...</p>
          ` : this.step ? this.renderStep(this.step) : html`
            <p class="onboarding__subtitle">Set up an AI provider to get started.</p>
          `}

          <!-- Skip -->
          <button class="onboarding__skip" @click=${this.skip} ?disabled=${this.loading}>Skip for now</button>
        </div>
      </div>
    `
  }

  private renderStep(step: WizardStep) {
    switch (step.type) {
      case 'select':
        return html`
          <div class="onboarding__step">
            ${step.message ? html`<p class="onboarding__subtitle">${step.message}</p>` : nothing}
            <div class="onboarding__options">
              ${(step.options ?? []).map(opt => html`
                <button
                  class="onboarding__option"
                  @click=${() => this.submitAnswer(opt.value)}
                  ?disabled=${this.loading}
                >
                  <span class="onboarding__option-label">${opt.label}</span>
                  ${opt.hint ? html`<span class="onboarding__option-hint">${opt.hint}</span>` : nothing}
                  <span class="onboarding__option-arrow">→</span>
                </button>
              `)}
            </div>
          </div>
        `

      case 'text':
        return html`
          <div class="onboarding__step">
            ${step.title ? html`<h2 class="onboarding__step-title">${step.title}</h2>` : nothing}
            ${step.message ? html`<p class="onboarding__subtitle">${step.message}</p>` : nothing}
            <input
              class="onboarding__input"
              type=${step.sensitive ? 'password' : 'text'}
              placeholder=${step.placeholder ?? ''}
              .value=${this.textValue}
              @input=${(e: Event) => { this.textValue = (e.target as HTMLInputElement).value }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.submitAnswer(this.textValue) }}
              ?disabled=${this.loading}
            />
            <button
              class="onboarding__btn onboarding__btn--primary"
              @click=${() => this.submitAnswer(this.textValue)}
              ?disabled=${this.loading || !this.textValue.trim()}
            >${this.loading ? 'Connecting...' : 'Connect'}</button>
          </div>
        `

      case 'confirm':
        return html`
          <div class="onboarding__step">
            ${step.message ? html`<p class="onboarding__subtitle">${step.message}</p>` : nothing}
            <div style="display:flex; gap:8px; justify-content:center;">
              <button class="onboarding__btn onboarding__btn--primary" @click=${() => this.submitAnswer(true)} ?disabled=${this.loading}>Confirm</button>
              <button class="onboarding__btn" @click=${() => this.submitAnswer(false)} ?disabled=${this.loading}>Cancel</button>
            </div>
          </div>
        `

      case 'note':
        return html`
          <div class="onboarding__step">
            ${step.title ? html`<h2 class="onboarding__step-title">${step.title}</h2>` : nothing}
            ${step.message ? html`<p class="onboarding__subtitle">${step.message}</p>` : nothing}
            <button class="onboarding__btn onboarding__btn--primary" @click=${() => this.submitAnswer(null)} ?disabled=${this.loading}>Continue</button>
          </div>
        `

      case 'progress':
      case 'action':
        return html`
          <div class="onboarding__step">
            ${step.message ? html`<p class="onboarding__subtitle">${step.message}</p>` : nothing}
            <div style="color:var(--muted);">Processing...</div>
          </div>
        `

      default:
        return html`<p class="onboarding__subtitle">Unknown step type: ${step.type}</p>`
    }
  }
}
