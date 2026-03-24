import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

/**
 * WizardStep shape returned by the wizard RPC.
 */
export interface WizardStep {
  id: string
  type: 'note' | 'select' | 'text' | 'confirm' | 'multiselect' | 'progress' | 'action'
  title?: string
  message?: string
  options?: Array<{ value: unknown; label: string; hint?: string }>
  initialValue?: unknown
  placeholder?: string
  sensitive?: boolean
  executor?: 'gateway' | 'client'
}

/**
 * Generic wizard step renderer. Renders different UI based on step.type
 * and emits `wizard-answer` events with { stepId, value }.
 */
@customElement('ocbot-wizard-step')
export class OcbotWizardStep extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) step!: WizardStep
  @property({ type: Boolean }) loading = false

  @state() private textValue = ''
  @state() private selectedValue: unknown = null
  @state() private selectedValues: Set<unknown> = new Set()

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('step') && this.step) {
      // Reset local state when step changes
      this.textValue = (this.step.initialValue as string) ?? ''
      this.selectedValue = this.step.initialValue ?? null
      this.selectedValues = new Set(
        Array.isArray(this.step.initialValue) ? this.step.initialValue : []
      )
    }
  }

  private _submit(value: unknown) {
    this.dispatchEvent(new CustomEvent('wizard-answer', {
      bubbles: true,
      composed: true,
      detail: { stepId: this.step.id, value },
    }))
  }

  override render() {
    if (!this.step) return nothing

    return html`
      <div class="wizard-step">
        ${this.step.title ? html`<h2 class="wizard-step__title">${this.step.title}</h2>` : nothing}
        ${this._renderBody()}
      </div>
    `
  }

  private _renderBody() {
    switch (this.step.type) {
      case 'note':
        return this._renderNote()
      case 'select':
        return this._renderSelect()
      case 'text':
        return this._renderText()
      case 'confirm':
        return this._renderConfirm()
      case 'multiselect':
        return this._renderMultiselect()
      case 'progress':
      case 'action':
        return this._renderProgress()
      default:
        return html`<p class="wizard-step__message">Unsupported step type: ${this.step.type}</p>`
    }
  }

  private _renderNote() {
    return html`
      ${this.step.message
        ? html`<div class="wizard-step__message">${this.step.message.split('\n').map(
            (line, i, arr) => html`${line}${i < arr.length - 1 ? html`<br>` : nothing}`
          )}</div>`
        : nothing}
      <div class="wizard-step__actions">
        <button
          class="wizard-step__btn wizard-step__btn--primary"
          ?disabled=${this.loading}
          @click=${() => this._submit(true)}
        >Continue</button>
      </div>
    `
  }

  private _renderSelect() {
    const options = this.step.options ?? []
    return html`
      ${this.step.message ? html`<p class="wizard-step__label">${this.step.message}</p>` : nothing}
      <div class="wizard-step__options">
        ${options.map(opt => html`
          <button
            class="wizard-step__option ${this.selectedValue === opt.value ? 'wizard-step__option--active' : ''}"
            ?disabled=${this.loading}
            @click=${() => {
              this.selectedValue = opt.value
              this._submit(opt.value)
            }}
          >
            <span class="wizard-step__option-label">${opt.label}</span>
            ${opt.hint ? html`<span class="wizard-step__option-hint">${opt.hint}</span>` : nothing}
          </button>
        `)}
      </div>
    `
  }

  private _renderText() {
    return html`
      ${this.step.message ? html`<label class="wizard-step__label">${this.step.message}</label>` : nothing}
      <input
        class="wizard-step__input"
        type=${this.step.sensitive ? 'password' : 'text'}
        .value=${this.textValue}
        placeholder=${this.step.placeholder ?? ''}
        ?disabled=${this.loading}
        @input=${(e: InputEvent) => { this.textValue = (e.target as HTMLInputElement).value }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter' && this.textValue.trim()) this._submit(this.textValue.trim())
        }}
      />
      <div class="wizard-step__actions">
        <button
          class="wizard-step__btn wizard-step__btn--primary"
          ?disabled=${this.loading || !this.textValue.trim()}
          @click=${() => this._submit(this.textValue.trim())}
        >Continue</button>
      </div>
    `
  }

  private _renderConfirm() {
    return html`
      ${this.step.message ? html`<p class="wizard-step__label">${this.step.message}</p>` : nothing}
      <div class="wizard-step__actions">
        <button
          class="wizard-step__btn wizard-step__btn--primary"
          ?disabled=${this.loading}
          @click=${() => this._submit(true)}
        >Yes</button>
        <button
          class="wizard-step__btn"
          ?disabled=${this.loading}
          @click=${() => this._submit(false)}
        >No</button>
      </div>
    `
  }

  private _renderMultiselect() {
    const options = this.step.options ?? []
    return html`
      ${this.step.message ? html`<p class="wizard-step__label">${this.step.message}</p>` : nothing}
      <div class="wizard-step__checklist">
        ${options.map(opt => {
          const checked = this.selectedValues.has(opt.value)
          return html`
            <label class="wizard-step__check">
              <input
                type="checkbox"
                .checked=${checked}
                ?disabled=${this.loading}
                @change=${() => {
                  const next = new Set(this.selectedValues)
                  if (checked) next.delete(opt.value)
                  else next.add(opt.value)
                  this.selectedValues = next
                }}
              />
              <span>${opt.label}</span>
              ${opt.hint ? html`<span class="wizard-step__option-hint">${opt.hint}</span>` : nothing}
            </label>
          `
        })}
      </div>
      <div class="wizard-step__actions">
        <button
          class="wizard-step__btn wizard-step__btn--primary"
          ?disabled=${this.loading}
          @click=${() => this._submit([...this.selectedValues])}
        >Continue</button>
      </div>
    `
  }

  private _renderProgress() {
    return html`
      <div class="wizard-step__progress">
        <div class="wizard-step__spinner"></div>
        ${this.step.message ? html`<p class="wizard-step__label">${this.step.message}</p>` : nothing}
      </div>
    `
  }
}
