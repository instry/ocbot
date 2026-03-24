import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

// --- JSON Schema (draft-07 subset) ---

interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchema>
  enum?: string[]
  default?: unknown
  description?: string
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
}

interface UiHint {
  label?: string
  help?: string
  placeholder?: string
  sensitive?: boolean
  advanced?: boolean
  hidden?: boolean
  order?: number
  tags?: string[]
}

interface FieldDef {
  key: string
  schema: JsonSchema
  hint: UiHint
  required: boolean
}

// Static credential hints for channels — used when no schema is available from gateway
// (i.e., the channel plugin hasn't been loaded yet because config is empty).
// Once saved, gateway restarts, plugin loads, and subsequent edits use the dynamic schema.
interface CredentialField {
  key: string
  label: string
  placeholder?: string
  sensitive?: boolean
  required?: boolean
  help?: string
}

const CHANNEL_CREDENTIAL_HINTS: Record<string, CredentialField[]> = {
  telegram: [
    { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', sensitive: true, required: true, help: 'Get your token from @BotFather on Telegram.' },
  ],
  whatsapp: [
    // WhatsApp uses QR-code auth, no token needed — placeholder for future UI
  ],
  discord: [
    { key: 'token', label: 'Bot Token', placeholder: 'Bot token from Developer Portal', sensitive: true, required: true, help: 'Create a bot at discord.com/developers/applications.' },
  ],
  slack: [
    { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...', sensitive: true, required: true, help: 'Bot User OAuth Token from your Slack app.' },
    { key: 'appToken', label: 'App Token', placeholder: 'xapp-...', sensitive: true, required: true, help: 'App-Level Token (for Socket Mode). Generate at api.slack.com/apps.' },
  ],
  irc: [
    { key: 'server', label: 'Server', placeholder: 'irc.libera.chat', required: true },
    { key: 'nick', label: 'Nick', placeholder: 'mybot' },
    { key: 'channel', label: 'Channel', placeholder: '#mychannel' },
  ],
  googlechat: [
    { key: 'serviceAccountKey', label: 'Service Account Key (JSON)', placeholder: 'Paste JSON key', sensitive: true, required: true, help: 'From Google Cloud Console → IAM → Service Accounts.' },
  ],
  signal: [
    { key: 'account', label: 'Phone Number', placeholder: '+1234567890', required: true, help: 'E.164 format phone number registered with Signal.' },
    { key: 'cliPath', label: 'signal-cli Path', placeholder: 'signal-cli', help: 'Path to signal-cli binary (default: signal-cli).' },
    { key: 'httpUrl', label: 'HTTP Daemon URL', placeholder: 'http://localhost:8080', help: 'signal-cli HTTP daemon endpoint.' },
  ],
  imessage: [
    { key: 'cliPath', label: 'imsg CLI Path', placeholder: 'imsg', help: 'Path to imsg binary (default: imsg).' },
    { key: 'dbPath', label: 'Messages Database Path', placeholder: '~/Library/Messages/chat.db', help: 'Override Messages.app database location (optional).' },
  ],
  line: [
    { key: 'channelAccessToken', label: 'Channel Access Token', placeholder: 'Token from LINE Developers', sensitive: true, required: true },
    { key: 'channelSecret', label: 'Channel Secret', placeholder: 'Secret from LINE Developers', sensitive: true, required: true },
  ],
}

@customElement('ocbot-channel-form')
export class OcbotChannelForm extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property({ type: String }) channelId = ''
  @property({ attribute: false }) configSchema: JsonSchema | null = null
  @property({ attribute: false }) configUiHints: Record<string, UiHint> | null = null
  @property({ attribute: false }) channelConfig: Record<string, unknown> = {}
  @property({ attribute: false }) configHash: string | null = null

  @state() private formData: Record<string, unknown> = {}
  @state() private saving = false
  @state() private error: string | null = null
  @state() private success: string | null = null
  @state() private showAdvanced = false

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('channelConfig')) {
      this.formData = { ...(this.channelConfig ?? {}) }
      this.error = null
      this.success = null
    }
  }

  private getFields(): FieldDef[] {
    const props = this.configSchema?.properties ?? {}
    const requiredSet = new Set(this.configSchema?.required ?? [])
    const hints = this.configUiHints ?? {}

    return Object.entries(props)
      .map(([key, schema]) => ({
        key,
        schema,
        hint: hints[key] ?? {},
        required: requiredSet.has(key),
      }))
      .filter(f => !f.hint.hidden)
      .sort((a, b) => {
        const oa = a.hint.order ?? 999
        const ob = b.hint.order ?? 999
        if (oa !== ob) return oa - ob
        return a.key.localeCompare(b.key)
      })
  }

  private getFieldLabel(field: FieldDef): string {
    return field.hint.label ?? field.key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
  }

  private getFieldValue(key: string, schema: JsonSchema): unknown {
    if (key in this.formData) return this.formData[key]
    if (schema.default !== undefined) return schema.default
    if (schema.type === 'boolean') return false
    if (schema.type === 'number' || schema.type === 'integer') return ''
    if (schema.type === 'array') return ''
    return ''
  }

  private setField(key: string, value: unknown) {
    this.formData = { ...this.formData, [key]: value }
  }

  private async save() {
    this.saving = true
    this.error = null
    this.success = null

    try {
      // Re-read config hash for conflict detection
      const freshConfig = await this.gateway.call<{ hash?: string }>('config.get')
      const baseHash = freshConfig?.hash ?? this.configHash ?? ''

      const patch = { channels: { [this.channelId]: this.formData } }
      await this.gateway.call('config.patch', {
        baseHash,
        raw: JSON.stringify(patch),
      })

      this.success = 'Configuration saved.'
      this.dispatchEvent(new CustomEvent('channel-saved', { bubbles: true, composed: true }))
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.saving = false
    }
  }

  private cancel() {
    this.dispatchEvent(new CustomEvent('channel-cancel', { bubbles: true, composed: true }))
  }

  override render() {
    // If gateway returned a schema, use the dynamic schema-driven form
    if (this.configSchema?.properties) {
      return this.renderSchemaForm()
    }
    // Otherwise, use static credential hints for initial setup
    return this.renderStaticForm()
  }

  private renderStaticForm() {
    const credentials = CHANNEL_CREDENTIAL_HINTS[this.channelId]
    if (!credentials || credentials.length === 0) {
      return html`
        <div class="settings__empty">
          Configuration for this channel is not yet available in the UI.
          You can configure it manually in Settings &rarr; Config.
        </div>
      `
    }

    return html`
      <div class="provider-form provider-form--full">
        ${this.error ? html`<div class="provider-form__error">${this.error}</div>` : nothing}
        ${this.success ? html`<div class="provider-form__success">${this.success}</div>` : nothing}

        ${credentials.map(cred => html`
          <div class="provider-form__field">
            <label class="provider-form__label">${cred.label}${cred.required ? ' *' : ''}</label>
            <input
              type=${cred.sensitive ? 'password' : 'text'}
              class="provider-form__input"
              placeholder=${cred.placeholder ?? ''}
              .value=${String(this.formData[cred.key] ?? '')}
              @input=${(e: Event) => this.setField(cred.key, (e.target as HTMLInputElement).value)}
            />
            ${cred.help ? html`<div class="channels__field-help">${cred.help}</div>` : nothing}
          </div>
        `)}

        <div class="provider-form__actions">
          <button class="provider-form__cancel-btn" @click=${() => this.cancel()}>Cancel</button>
          <button
            class="provider-form__save"
            @click=${() => this.save()}
            ?disabled=${this.saving || !this.hasRequiredFields(credentials)}
          >${this.saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    `
  }

  private hasRequiredFields(credentials: CredentialField[]): boolean {
    return credentials
      .filter(c => c.required)
      .every(c => {
        const val = this.formData[c.key]
        return typeof val === 'string' && val.trim().length > 0
      })
  }

  private renderSchemaForm() {    const allFields = this.getFields()
    const normalFields = allFields.filter(f => !f.hint.advanced)
    const advancedFields = allFields.filter(f => f.hint.advanced)

    return html`
      <div class="provider-form provider-form--full">
        ${this.error ? html`
          <div class="provider-form__error">${this.error}</div>
        ` : nothing}
        ${this.success ? html`
          <div class="provider-form__success">${this.success}</div>
        ` : nothing}

        ${normalFields.map(f => this.renderField(f))}

        ${advancedFields.length > 0 ? html`
          <button
            class="channels__advanced-toggle"
            @click=${() => { this.showAdvanced = !this.showAdvanced }}
          >${this.showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}</button>

          ${this.showAdvanced ? advancedFields.map(f => this.renderField(f)) : nothing}
        ` : nothing}

        <div class="provider-form__actions">
          <button
            class="provider-form__cancel-btn"
            @click=${() => this.cancel()}
          >Cancel</button>
          <button
            class="provider-form__save"
            @click=${() => this.save()}
            ?disabled=${this.saving}
          >${this.saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    `
  }

  private renderField(field: FieldDef) {
    const { key, schema, hint } = field
    const label = this.getFieldLabel(field)
    const value = this.getFieldValue(key, schema)

    // Boolean → checkbox
    if (schema.type === 'boolean') {
      return html`
        <div class="provider-form__field">
          <label class="channels__checkbox-label">
            <input
              type="checkbox"
              .checked=${!!value}
              @change=${(e: Event) => this.setField(key, (e.target as HTMLInputElement).checked)}
            />
            <span>${label}</span>
          </label>
          ${hint.help ? html`<div class="channels__field-help">${hint.help}</div>` : nothing}
        </div>
      `
    }

    // String with enum → select dropdown
    if (schema.type === 'string' && schema.enum?.length) {
      return html`
        <div class="provider-form__field">
          <label class="provider-form__label">${label}${field.required ? ' *' : ''}</label>
          <select
            class="provider-form__select"
            .value=${String(value ?? '')}
            @change=${(e: Event) => this.setField(key, (e.target as HTMLSelectElement).value)}
          >
            <option value="">— Select —</option>
            ${schema.enum!.map(opt => html`
              <option value=${opt} ?selected=${value === opt}>${opt}</option>
            `)}
          </select>
          ${hint.help ? html`<div class="channels__field-help">${hint.help}</div>` : nothing}
        </div>
      `
    }

    // Number / integer
    if (schema.type === 'number' || schema.type === 'integer') {
      return html`
        <div class="provider-form__field">
          <label class="provider-form__label">${label}${field.required ? ' *' : ''}</label>
          <input
            type="number"
            class="provider-form__input"
            placeholder=${hint.placeholder ?? ''}
            .value=${String(value ?? '')}
            ?step=${schema.type === 'integer' ? '1' : 'any'}
            @input=${(e: Event) => {
              const raw = (e.target as HTMLInputElement).value
              if (raw === '') {
                this.setField(key, undefined)
              } else {
                this.setField(key, schema.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw))
              }
            }}
          />
          ${hint.help ? html`<div class="channels__field-help">${hint.help}</div>` : nothing}
        </div>
      `
    }

    // Array of string/number → comma-separated text input
    if (schema.type === 'array') {
      const arrValue = Array.isArray(value) ? (value as unknown[]).join(', ') : String(value ?? '')
      return html`
        <div class="provider-form__field">
          <label class="provider-form__label">${label}${field.required ? ' *' : ''}</label>
          <input
            type="text"
            class="provider-form__input"
            placeholder=${hint.placeholder ?? 'Comma-separated values'}
            .value=${arrValue}
            @input=${(e: Event) => {
              const raw = (e.target as HTMLInputElement).value
              const items = raw.split(',').map(s => s.trim()).filter(Boolean)
              const itemType = schema.items?.type
              if (itemType === 'number' || itemType === 'integer') {
                this.setField(key, items.map(Number).filter(n => !isNaN(n)))
              } else {
                this.setField(key, items)
              }
            }}
          />
          ${hint.help ? html`<div class="channels__field-help">${hint.help}</div>` : nothing}
        </div>
      `
    }

    // Default: string → text input (or password if sensitive)
    return html`
      <div class="provider-form__field">
        <label class="provider-form__label">${label}${field.required ? ' *' : ''}</label>
        <input
          type=${hint.sensitive ? 'password' : 'text'}
          class="provider-form__input"
          placeholder=${hint.placeholder ?? ''}
          .value=${String(value ?? '')}
          @input=${(e: Event) => this.setField(key, (e.target as HTMLInputElement).value)}
        />
        ${hint.help ? html`<div class="channels__field-help">${hint.help}</div>` : nothing}
      </div>
    `
  }
}
