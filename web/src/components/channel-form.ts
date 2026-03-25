import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import QRCode from 'qrcode'
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
  type?: 'text' | 'password' | 'number' | 'boolean' | 'select'
  placeholder?: string
  sensitive?: boolean
  required?: boolean
  help?: string
  options?: { value: string; label: string }[]
  default?: unknown
}

interface ChannelHints {
  fields: CredentialField[]
}

// Helper: accept either a bare array (legacy) or a ChannelHints object
function getChannelHints(channelId: string): ChannelHints {
  const raw = CHANNEL_CREDENTIAL_HINTS[channelId]
  if (!raw) return { fields: [] }
  if (Array.isArray(raw)) return { fields: raw }
  return raw
}

const CHANNEL_CREDENTIAL_HINTS: Record<string, CredentialField[] | ChannelHints> = {
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
  // Extension channels
  feishu: {
    fields: [
      { key: 'appId', label: 'App ID', placeholder: 'cli_...', required: true, help: 'From Feishu Open Platform → Credentials.' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'App secret', sensitive: true, type: 'password', required: true, help: 'Keep confidential. Rotate if exposed.' },
      { key: 'enabled', label: 'Enable Channel', type: 'boolean', default: true, help: 'Enable or disable this channel.' },
      { key: 'domain', label: 'Domain', type: 'select', default: 'feishu', options: [{ value: 'feishu', label: 'Feishu (China)' }, { value: 'lark', label: 'Lark (Global)' }], help: 'Feishu for China, Lark for global tenants.' },
      { key: 'connectionMode', label: 'Connection Mode', type: 'select', default: 'websocket', options: [{ value: 'websocket', label: 'WebSocket (Recommended)' }, { value: 'webhook', label: 'Webhook' }], help: 'WebSocket requires no public endpoint.' },
      { key: 'encryptKey', label: 'Encrypt Key', type: 'password', sensitive: true, help: 'Required for webhook mode.' },
      { key: 'verificationToken', label: 'Verification Token', type: 'password', sensitive: true, help: 'Required for webhook mode.' },
      { key: 'webhookPort', label: 'Webhook Port', type: 'number', help: 'Port for webhook server (webhook mode only).' },
      { key: 'webhookPath', label: 'Webhook Path', placeholder: '/feishu/events', help: 'HTTP path for webhook events.' },
      { key: 'dmPolicy', label: 'DM Policy', type: 'select', default: 'pairing', options: [{ value: 'pairing', label: 'Pairing (Approval Code)' }, { value: 'open', label: 'Open' }, { value: 'allowlist', label: 'Allowlist' }, { value: 'disabled', label: 'Disabled' }], help: 'Direct message access control.' },
      { key: 'allowFrom', label: 'DM Allowlist', placeholder: 'open_id_1, open_id_2', help: 'Comma-separated open_id values. Use * for open policy.' },
      { key: 'groupPolicy', label: 'Group Policy', type: 'select', default: 'open', options: [{ value: 'open', label: 'Open' }, { value: 'allowlist', label: 'Allowlist' }, { value: 'disabled', label: 'Disabled' }], help: 'Group message access control.' },
      { key: 'groupAllowFrom', label: 'Group Allowlist', placeholder: 'chat_id_1, chat_id_2', help: 'Comma-separated chat_id values.' },
      { key: 'requireMention', label: 'Require @Mention in Groups', type: 'boolean', default: true, help: 'Bot only responds when mentioned in group chats.' },
      { key: 'streaming', label: 'Enable Streaming', type: 'boolean', default: true, help: 'Card Kit streaming for incremental text display.' },
      { key: 'renderMode', label: 'Render Mode', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Auto' }, { value: 'raw', label: 'Raw (Plain Text)' }, { value: 'card', label: 'Card' }], help: 'Message rendering format.' },
      { key: 'replyInThread', label: 'Reply in Thread', type: 'select', default: 'disabled', options: [{ value: 'disabled', label: 'Disabled' }, { value: 'enabled', label: 'Enabled' }], help: 'Bot replies create topic threads when enabled.' },
      { key: 'typingIndicator', label: 'Typing Indicator', type: 'boolean', default: true, help: 'Show typing status while generating response.' },
      { key: 'resolveSenderNames', label: 'Resolve Sender Names', type: 'boolean', default: true, help: 'Fetch sender display names from Feishu.' },
      { key: 'textChunkLimit', label: 'Text Chunk Limit', type: 'number', default: 2000, help: 'Max characters per message chunk.' },
      { key: 'mediaMaxMb', label: 'Max Media Size (MB)', type: 'number', default: 30, help: 'Media upload/download size limit.' },
      { key: 'historyLimit', label: 'Group History Limit', type: 'number', help: 'Max messages to include as context in groups.' },
      { key: 'dmHistoryLimit', label: 'DM History Limit', type: 'number', help: 'Max messages to include as context in DMs.' },
    ],
  },
  matrix: [
    { key: 'homeserverUrl', label: 'Homeserver URL', placeholder: 'https://matrix.org', required: true },
    { key: 'accessToken', label: 'Access Token', sensitive: true, required: true, help: 'Bot user access token.' },
  ],
  mattermost: [
    { key: 'url', label: 'Server URL', placeholder: 'https://mattermost.example.com', required: true },
    { key: 'token', label: 'Bot Token', sensitive: true, required: true, help: 'Personal access token or bot token.' },
  ],
  msteams: [
    { key: 'appId', label: 'App ID', required: true, help: 'Azure AD application (client) ID.' },
    { key: 'appPassword', label: 'App Password', sensitive: true, required: true, help: 'Azure AD client secret.' },
  ],
  'nextcloud-talk': [
    { key: 'url', label: 'Nextcloud URL', placeholder: 'https://cloud.example.com', required: true },
    { key: 'token', label: 'App Token', sensitive: true, required: true },
  ],
  nostr: [
    { key: 'privateKey', label: 'Private Key (nsec)', sensitive: true, required: true, help: 'Nostr private key in nsec or hex format.' },
    { key: 'relays', label: 'Relay URLs', placeholder: 'wss://relay.damus.io, wss://nos.lol', help: 'Comma-separated relay URLs.' },
  ],
  'synology-chat': [
    { key: 'url', label: 'Synology URL', placeholder: 'https://nas.example.com:5001', required: true },
    { key: 'token', label: 'Bot Token', sensitive: true, required: true },
  ],
  twitch: [
    { key: 'token', label: 'OAuth Token', placeholder: 'oauth:...', sensitive: true, required: true, help: 'Twitch bot OAuth token.' },
    { key: 'channel', label: 'Channel', placeholder: 'channelname', required: true },
  ],
  zalo: [
    { key: 'accessToken', label: 'OA Access Token', sensitive: true, required: true, help: 'Zalo Official Account access token.' },
  ],
  bluebubbles: [
    { key: 'url', label: 'Server URL', placeholder: 'http://localhost:1234', required: true, help: 'BlueBubbles server address.' },
    { key: 'password', label: 'Password', sensitive: true, required: true },
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
  @state() private submitted = false

  // Feishu QR code install state
  @state() private qrStatus: 'idle' | 'loading' | 'showing' | 'success' | 'error' = 'idle'
  @state() private qrDataUrl = ''
  @state() private qrError = ''
  @state() private qrTimeLeft = 0
  private qrDeviceCode = ''
  private qrPollTimer: ReturnType<typeof setInterval> | null = null
  private qrCountdownTimer: ReturnType<typeof setInterval> | null = null

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('channelConfig') || changed.has('channelId')) {
      const base = { ...(this.channelConfig ?? {}) }
      const { fields } = getChannelHints(this.channelId)
      for (const cred of fields) {
        if (cred.default !== undefined && !(cred.key in base)) {
          base[cred.key] = cred.default
        }
      }
      this.formData = base
      this.error = null
      this.success = null
      this.submitted = false
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
    this.submitted = true
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

      this.success = 'Channel saved successfully! The gateway will connect automatically.'
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

  // --- Feishu QR code install ---

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.cleanupQr()
  }

  private cleanupQr() {
    if (this.qrPollTimer) { clearInterval(this.qrPollTimer); this.qrPollTimer = null }
    if (this.qrCountdownTimer) { clearInterval(this.qrCountdownTimer); this.qrCountdownTimer = null }
  }

  private async startFeishuQr() {
    this.cleanupQr()
    this.qrStatus = 'loading'
    this.qrError = ''

    try {
      const isLark = this.formData.domain === 'lark'
      const result = await this.gateway.call<{
        url: string; deviceCode: string; interval: number; expireIn: number
      }>('channel.feishu.install.qrcode', { isLark })

      this.qrDeviceCode = result.deviceCode
      const expireIn = result.expireIn ?? 300
      this.qrTimeLeft = expireIn
      this.qrDataUrl = await QRCode.toDataURL(result.url, { width: 200, margin: 2 })
      this.qrStatus = 'showing'

      // Countdown timer
      this.qrCountdownTimer = setInterval(() => {
        this.qrTimeLeft--
        if (this.qrTimeLeft <= 0) {
          this.cleanupQr()
          this.qrStatus = 'error'
          this.qrError = 'QR code expired. Please try again.'
        }
      }, 1000)

      // Poll for scan result
      const intervalMs = Math.max(result.interval ?? 5, 3) * 1000
      this.qrPollTimer = setInterval(async () => {
        try {
          const poll = await this.gateway.call<{
            done: boolean; appId?: string; appSecret?: string; domain?: string; error?: string
          }>('channel.feishu.install.poll', { deviceCode: this.qrDeviceCode, isLark })

          if (poll.done && poll.appId && poll.appSecret) {
            this.cleanupQr()
            this.formData = {
              ...this.formData,
              appId: poll.appId,
              appSecret: poll.appSecret,
              domain: poll.domain ?? 'feishu',
              enabled: true,
            }
            this.qrStatus = 'success'
          } else if (poll.error) {
            this.cleanupQr()
            this.qrStatus = 'error'
            this.qrError = poll.error
          }
        } catch { /* keep polling */ }
      }, intervalMs)
    } catch (err) {
      this.qrStatus = 'error'
      this.qrError = err instanceof Error ? err.message : 'Failed to start QR code flow'
    }
  }

  private renderFeishuQrSection() {
    if (this.channelId !== 'feishu') return nothing

    return html`
      <div class="provider-form__qr-section">
        ${this.qrStatus === 'idle' ? html`
          <button
            class="provider-form__qr-btn"
            @click=${() => this.startFeishuQr()}
          >Scan QR Code to Connect</button>
          <div class="channels__field-help">
            Scan with Feishu app to automatically configure Bot credentials.
          </div>
        ` : nothing}

        ${this.qrStatus === 'loading' ? html`
          <div class="provider-form__qr-loading">Generating QR code...</div>
        ` : nothing}

        ${this.qrStatus === 'showing' ? html`
          <div class="provider-form__qr-display">
            <img src=${this.qrDataUrl} alt="Feishu QR Code" class="provider-form__qr-img" />
            <div class="provider-form__qr-countdown">
              Expires in ${Math.floor(this.qrTimeLeft / 60)}:${String(this.qrTimeLeft % 60).padStart(2, '0')}
            </div>
            <div class="channels__field-help">Open Feishu app and scan this QR code</div>
            <button
              class="provider-form__qr-refresh"
              @click=${() => this.startFeishuQr()}
            >Refresh</button>
          </div>
        ` : nothing}

        ${this.qrStatus === 'success' ? html`
          <div class="provider-form__success">
            Credentials configured via QR code. Click Save to apply.
          </div>
        ` : nothing}

        ${this.qrStatus === 'error' ? html`
          <div class="provider-form__error">${this.qrError}</div>
          <button
            class="provider-form__qr-btn"
            @click=${() => this.startFeishuQr()}
          >Try Again</button>
        ` : nothing}

        <div class="provider-form__qr-divider">
          <span>or configure manually</span>
        </div>
      </div>
    `
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
    const { fields: credentials } = getChannelHints(this.channelId)
    if (!credentials || credentials.length === 0) {
      return html`
        <div class="settings__empty">
          Configuration for this channel is not yet available in the UI.
          You can configure it manually in Settings &rarr; Config.
        </div>
      `
    }

    const requiredCreds = credentials.filter(c => c.required)
    const optionalCreds = credentials.filter(c => !c.required)

    return html`
      <div class="provider-form provider-form--full">
        ${this.error ? html`<div class="provider-form__error">${this.error}</div>` : nothing}
        ${this.success ? html`<div class="provider-form__success">${this.success}</div>` : nothing}

        ${this.renderFeishuQrSection()}

        ${requiredCreds.map(cred => this.renderStaticField(cred))}

        ${optionalCreds.length > 0 ? html`
          <button
            class="channels__advanced-toggle"
            @click=${() => { this.showAdvanced = !this.showAdvanced }}
          >${this.showAdvanced ? 'Hide optional settings' : `Show optional settings (${optionalCreds.length})`}</button>

          ${this.showAdvanced ? optionalCreds.map(cred => this.renderStaticField(cred)) : nothing}
        ` : nothing}

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

  private renderStaticField(cred: CredentialField) {
    const empty = this.submitted && cred.required && this.isFieldEmpty(cred.key)
    const type = cred.type ?? (cred.sensitive ? 'password' : 'text')
    const reqMark = cred.required ? this.renderRequiredMark() : nothing

    // Boolean → checkbox
    if (type === 'boolean') {
      return html`
        <div class="provider-form__field">
          <label class="channels__checkbox-label">
            <input
              type="checkbox"
              .checked=${!!this.formData[cred.key]}
              @change=${(e: Event) => this.setField(cred.key, (e.target as HTMLInputElement).checked)}
            />
            <span>${cred.label}</span>
          </label>
          ${cred.help ? html`<div class="channels__field-help">${cred.help}</div>` : nothing}
        </div>
      `
    }

    // Select → dropdown
    if (type === 'select' && cred.options?.length) {
      const value = String(this.formData[cred.key] ?? '')
      return html`
        <div class="provider-form__field">
          <label class="provider-form__label">${cred.label}${reqMark}</label>
          <select
            class="provider-form__select ${empty ? 'provider-form__select--error' : ''}"
            .value=${value}
            @change=${(e: Event) => this.setField(cred.key, (e.target as HTMLSelectElement).value || undefined)}
          >
            <option value="">— Select —</option>
            ${cred.options!.map(opt => html`
              <option value=${opt.value} ?selected=${value === opt.value}>${opt.label}</option>
            `)}
          </select>
          ${cred.help ? html`<div class="channels__field-help">${cred.help}</div>` : nothing}
          ${empty ? html`<div class="channels__field-error">${cred.label} is required</div>` : nothing}
        </div>
      `
    }

    // Number
    if (type === 'number') {
      return html`
        <div class="provider-form__field">
          <label class="provider-form__label">${cred.label}${reqMark}</label>
          <input
            type="number"
            class="provider-form__input ${empty ? 'provider-form__input--error' : ''}"
            placeholder=${cred.placeholder ?? ''}
            .value=${String(this.formData[cred.key] ?? '')}
            @input=${(e: Event) => {
              const raw = (e.target as HTMLInputElement).value
              this.setField(cred.key, raw === '' ? undefined : parseInt(raw, 10))
            }}
          />
          ${cred.help ? html`<div class="channels__field-help">${cred.help}</div>` : nothing}
          ${empty ? html`<div class="channels__field-error">${cred.label} is required</div>` : nothing}
        </div>
      `
    }

    // Default: text / password
    return html`
      <div class="provider-form__field">
        <label class="provider-form__label">${cred.label}${reqMark}</label>
        <input
          type=${type === 'password' || cred.sensitive ? 'password' : 'text'}
          class="provider-form__input ${empty ? 'provider-form__input--error' : ''}"
          placeholder=${cred.placeholder ?? ''}
          .value=${String(this.formData[cred.key] ?? '')}
          @input=${(e: Event) => this.setField(cred.key, (e.target as HTMLInputElement).value)}
        />
        ${cred.help ? html`<div class="channels__field-help">${cred.help}</div>` : nothing}
        ${empty ? html`<div class="channels__field-error">${cred.label} is required</div>` : nothing}
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

  private isFieldEmpty(key: string): boolean {
    const val = this.formData[key]
    return val === undefined || val === null || (typeof val === 'string' && val.trim() === '')
  }

  private renderRequiredMark() {
    return html`<span class="channels__required-mark">*</span>`
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
    const empty = this.submitted && field.required && this.isFieldEmpty(key)

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
          <label class="provider-form__label">${label}${field.required ? this.renderRequiredMark() : nothing}</label>
          <select
            class="provider-form__select ${empty ? 'provider-form__select--error' : ''}"
            .value=${String(value ?? '')}
            @change=${(e: Event) => this.setField(key, (e.target as HTMLSelectElement).value)}
          >
            <option value="">— Select —</option>
            ${schema.enum!.map(opt => html`
              <option value=${opt} ?selected=${value === opt}>${opt}</option>
            `)}
          </select>
          ${hint.help ? html`<div class="channels__field-help">${hint.help}</div>` : nothing}
          ${empty ? html`<div class="channels__field-error">${label} is required</div>` : nothing}
        </div>
      `
    }

    // Number / integer
    if (schema.type === 'number' || schema.type === 'integer') {
      return html`
        <div class="provider-form__field">
          <label class="provider-form__label">${label}${field.required ? this.renderRequiredMark() : nothing}</label>
          <input
            type="number"
            class="provider-form__input ${empty ? 'provider-form__input--error' : ''}"
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
          ${empty ? html`<div class="channels__field-error">${label} is required</div>` : nothing}
        </div>
      `
    }

    // Array of string/number → comma-separated text input
    if (schema.type === 'array') {
      const arrValue = Array.isArray(value) ? (value as unknown[]).join(', ') : String(value ?? '')
      return html`
        <div class="provider-form__field">
          <label class="provider-form__label">${label}${field.required ? this.renderRequiredMark() : nothing}</label>
          <input
            type="text"
            class="provider-form__input ${empty ? 'provider-form__input--error' : ''}"
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
          ${empty ? html`<div class="channels__field-error">${label} is required</div>` : nothing}
        </div>
      `
    }

    // Default: string → text input (or password if sensitive)
    return html`
      <div class="provider-form__field">
        <label class="provider-form__label">${label}${field.required ? this.renderRequiredMark() : nothing}</label>
        <input
          type=${hint.sensitive ? 'password' : 'text'}
          class="provider-form__input ${empty ? 'provider-form__input--error' : ''}"
          placeholder=${hint.placeholder ?? ''}
          .value=${String(value ?? '')}
          @input=${(e: Event) => this.setField(key, (e.target as HTMLInputElement).value)}
        />
        ${hint.help ? html`<div class="channels__field-help">${hint.help}</div>` : nothing}
        ${empty ? html`<div class="channels__field-error">${label} is required</div>` : nothing}
      </div>
    `
  }
}
