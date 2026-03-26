import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import QRCode from 'qrcode'

// --- Credential field spec ---

interface CredentialField {
  key: string
  label: string
  type?: 'text' | 'password' | 'select'
  placeholder?: string
  sensitive?: boolean
  required?: boolean
  help?: string
  default?: unknown
  options?: { value: string; label: string }[]
}

interface CredentialSpec {
  fields: CredentialField[]
  qrSupport?: boolean
}

const CHANNEL_CREDENTIALS: Record<string, CredentialSpec> = {
  telegram: {
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', sensitive: true, required: true, help: 'Get your token from @BotFather on Telegram.' },
    ],
  },
  whatsapp: { fields: [] },
  discord: {
    fields: [
      { key: 'token', label: 'Bot Token', placeholder: 'Bot token from Developer Portal', sensitive: true, required: true, help: 'Create a bot at discord.com/developers/applications.' },
    ],
  },
  slack: {
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...', sensitive: true, required: true, help: 'Bot User OAuth Token from your Slack app.' },
      { key: 'appToken', label: 'App Token', placeholder: 'xapp-...', sensitive: true, required: true, help: 'App-Level Token (for Socket Mode). Generate at api.slack.com/apps.' },
    ],
  },
  irc: {
    fields: [
      { key: 'server', label: 'Server', placeholder: 'irc.libera.chat', required: true },
      { key: 'nick', label: 'Nick', placeholder: 'mybot' },
      { key: 'channel', label: 'Channel', placeholder: '#mychannel' },
    ],
  },
  googlechat: {
    fields: [
      { key: 'serviceAccountKey', label: 'Service Account Key (JSON)', placeholder: 'Paste JSON key', sensitive: true, required: true, help: 'From Google Cloud Console.' },
    ],
  },
  signal: {
    fields: [
      { key: 'account', label: 'Phone Number', placeholder: '+1234567890', required: true, help: 'E.164 format phone number registered with Signal.' },
    ],
  },
  feishu: {
    fields: [
      { key: 'appId', label: 'App ID', placeholder: 'cli_...', required: true, help: 'From Feishu Open Platform.' },
      { key: 'appSecret', label: 'App Secret', placeholder: 'App secret', sensitive: true, required: true, help: 'Keep confidential. Rotate if exposed.' },
      { key: 'domain', label: 'Domain', type: 'select', default: 'feishu', options: [{ value: 'feishu', label: 'Feishu (China)' }, { value: 'lark', label: 'Lark (Global)' }], help: 'Feishu for China, Lark for global tenants.' },
    ],
    qrSupport: true,
  },
  line: {
    fields: [
      { key: 'channelAccessToken', label: 'Channel Access Token', placeholder: 'Token from LINE Developers', sensitive: true, required: true },
      { key: 'channelSecret', label: 'Channel Secret', placeholder: 'Secret from LINE Developers', sensitive: true, required: true },
    ],
  },
  matrix: {
    fields: [
      { key: 'homeserverUrl', label: 'Homeserver URL', placeholder: 'https://matrix.org', required: true },
      { key: 'accessToken', label: 'Access Token', sensitive: true, required: true },
    ],
  },
  mattermost: {
    fields: [
      { key: 'url', label: 'Server URL', placeholder: 'https://mattermost.example.com', required: true },
      { key: 'token', label: 'Bot Token', sensitive: true, required: true },
    ],
  },
  msteams: {
    fields: [
      { key: 'appId', label: 'App ID', required: true, help: 'Azure AD application (client) ID.' },
      { key: 'appPassword', label: 'App Password', sensitive: true, required: true, help: 'Azure AD client secret.' },
    ],
  },
  nostr: {
    fields: [
      { key: 'privateKey', label: 'Private Key (nsec)', sensitive: true, required: true },
    ],
  },
  twitch: {
    fields: [
      { key: 'token', label: 'OAuth Token', placeholder: 'oauth:...', sensitive: true, required: true },
      { key: 'channel', label: 'Channel', placeholder: 'channelname', required: true },
    ],
  },
  bluebubbles: {
    fields: [
      { key: 'url', label: 'Server URL', placeholder: 'http://localhost:1234', required: true },
      { key: 'password', label: 'Password', sensitive: true, required: true },
    ],
  },
}

// --- Component ---

@customElement('ocbot-channel-credentials')
export class OcbotChannelCredentials extends LitElement {
  override createRenderRoot() { return this }

  @property({ type: String }) channelId = ''
  @property({ attribute: false }) initialConfig: Record<string, unknown> | null = null

  @state() private formData: Record<string, unknown> = {}
  @state() private saving = false
  @state() private error: string | null = null
  @state() private success: string | null = null

  // Feishu QR code state
  @state() private qrStatus: 'idle' | 'loading' | 'showing' | 'success' | 'error' = 'idle'
  @state() private qrDataUrl = ''
  @state() private qrError = ''
  @state() private qrTimeLeft = 0
  private qrDeviceCode = ''
  private qrPollTimer: ReturnType<typeof setInterval> | null = null
  private qrCountdownTimer: ReturnType<typeof setInterval> | null = null

  private prevChannelId = ''
  private prevInitialConfigKey = ''

  override willUpdate(changed: Map<string, unknown>) {
    const initialConfigKey = this.getInitialConfigKey()
    if (changed.has('channelId') && this.channelId !== this.prevChannelId) {
      this.prevChannelId = this.channelId
      this.prevInitialConfigKey = initialConfigKey
      this.resetForm()
    } else if (changed.has('initialConfig') && initialConfigKey !== this.prevInitialConfigKey) {
      this.prevInitialConfigKey = initialConfigKey
      this.resetForm()
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.cleanupQr()
  }

  private resetForm() {
    const spec = CHANNEL_CREDENTIALS[this.channelId]
    const base: Record<string, unknown> = {}
    if (spec) {
      for (const f of spec.fields) {
        if (f.default !== undefined) base[f.key] = f.default
      }
    }
    this.formData = {
      ...base,
      ...this.getInitialFormData(),
    }
    this.error = null
    this.success = null
    this.saving = false
    this.cleanupQr()
    this.qrStatus = 'idle'
  }

  private getInitialFormData(): Record<string, unknown> {
    const spec = CHANNEL_CREDENTIALS[this.channelId]
    const source = this.initialConfig
    if (!spec || !source) return {}

    const data: Record<string, unknown> = {}
    for (const field of spec.fields) {
      const value = source[field.key]
      if (typeof value === 'string' && value.trim()) {
        data[field.key] = value
      }
    }
    return data
  }

  private getInitialConfigKey(): string {
    const spec = CHANNEL_CREDENTIALS[this.channelId]
    if (!spec || !this.initialConfig) return `${this.channelId}:`
    const picked = spec.fields.map(field => `${field.key}:${String(this.initialConfig?.[field.key] ?? '')}`)
    return `${this.channelId}:${picked.join('|')}`
  }

  private hasInitialCredentials(): boolean {
    return Object.keys(this.getInitialFormData()).length > 0
  }

  // --- QR code (Feishu) ---

  private static readonly FEISHU_AUTH_URL = 'https://accounts.feishu.cn'
  private static readonly LARK_AUTH_URL = 'https://accounts.larksuite.com'

  private getFeishuAuthBase(): string {
    return this.formData.domain === 'lark'
      ? OcbotChannelCredentials.LARK_AUTH_URL
      : OcbotChannelCredentials.FEISHU_AUTH_URL
  }

  private cleanupQr() {
    if (this.qrPollTimer) { clearInterval(this.qrPollTimer); this.qrPollTimer = null }
    if (this.qrCountdownTimer) { clearInterval(this.qrCountdownTimer); this.qrCountdownTimer = null }
  }

  private async feishuAuthRequest(action: string, extra: Record<string, string> = {}) {
    const body = new URLSearchParams({ action, ...extra })
    const resp = await fetch(`${this.getFeishuAuthBase()}/oauth/v1/app/registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    return resp.json()
  }

  private async startFeishuQr() {
    this.cleanupQr()
    this.qrStatus = 'loading'
    this.qrError = ''

    try {
      await this.feishuAuthRequest('init')

      const beginResp = await this.feishuAuthRequest('begin', {
        archetype: 'PersonalAgent',
        auth_method: 'client_secret',
        request_user_info: 'open_id',
      })

      this.qrDeviceCode = beginResp.device_code
      const expireIn = beginResp.expire_in ?? 300
      this.qrTimeLeft = expireIn
      this.qrDataUrl = await QRCode.toDataURL(beginResp.verification_uri_complete, { width: 200, margin: 2 })
      this.qrStatus = 'showing'

      this.qrCountdownTimer = setInterval(() => {
        this.qrTimeLeft--
        if (this.qrTimeLeft <= 0) {
          this.cleanupQr()
          this.qrStatus = 'error'
          this.qrError = 'QR code expired. Please try again.'
        }
      }, 1000)

      const intervalMs = Math.max(beginResp.interval ?? 5, 3) * 1000
      this.qrPollTimer = setInterval(async () => {
        try {
          const pollResp = await this.feishuAuthRequest('poll', {
            device_code: this.qrDeviceCode,
          })

          if (pollResp.client_id && pollResp.client_secret) {
            this.cleanupQr()
            const domain = pollResp.user_info?.tenant_brand === 'lark' ? 'lark' : 'feishu'
            this.formData = {
              ...this.formData,
              appId: pollResp.client_id,
              appSecret: pollResp.client_secret,
              domain,
            }
            this.qrStatus = 'success'
          } else if (pollResp.error && pollResp.error !== 'authorization_pending' && pollResp.error !== 'slow_down') {
            this.cleanupQr()
            this.qrStatus = 'error'
            this.qrError = pollResp.error_description || pollResp.error
          }
        } catch { /* keep polling */ }
      }, intervalMs)
    } catch (err) {
      this.qrStatus = 'error'
      this.qrError = err instanceof Error ? err.message : 'Failed to start QR code flow'
    }
  }

  // --- Validation ---

  private isValid(): boolean {
    const spec = CHANNEL_CREDENTIALS[this.channelId]
    if (!spec) return false
    return spec.fields
      .filter(f => f.required)
      .every(f => {
        const val = this.formData[f.key]
        return typeof val === 'string' && val.trim().length > 0
      })
  }

  private isFieldEmpty(key: string): boolean {
    const val = this.formData[key]
    return val === undefined || val === null || (typeof val === 'string' && val.trim() === '')
  }

  // --- Save ---

  private save() {
    this.saving = true
    this.error = null
    this.dispatchEvent(new CustomEvent('credentials-ready', {
      bubbles: true, composed: true,
      detail: { channelId: this.channelId, config: { ...this.formData, enabled: true } },
    }))
  }

  /** Called by parent when save completes or fails */
  setSaveResult(result: { ok: boolean; error?: string }) {
    this.saving = false
    if (result.ok) {
      this.success = 'Credentials saved. Connecting...'
    } else {
      this.error = result.error ?? 'Failed to save credentials'
    }
  }

  // --- Render ---

  override render() {
    const spec = CHANNEL_CREDENTIALS[this.channelId]
    if (!spec || spec.fields.length === 0) {
      return html`
        <div class="settings__empty">
          Configuration for this channel is not yet available in the UI.
          You can configure it manually in Settings.
        </div>
      `
    }

    return html`
      <div class="provider-form provider-form--full">
        ${this.error ? html`<div class="provider-form__error">${this.error}</div>` : nothing}
        ${this.success ? html`<div class="provider-form__success">${this.success}</div>` : nothing}

        ${spec.qrSupport ? this.renderQrSection() : nothing}

        ${spec.fields.map(f => this.renderField(f))}

        <div class="provider-form__actions">
          <button
            class="provider-form__save"
            @click=${() => this.save()}
            ?disabled=${this.saving || !this.isValid()}
          >${this.saving ? 'Saving...' : 'Save & Connect'}</button>
        </div>
      </div>
    `
  }

  private renderQrSection() {
    if (this.channelId !== 'feishu') return nothing

    return html`
      <div class="provider-form__qr-section">
        ${this.qrStatus === 'idle' ? html`
          <button
            class="provider-form__qr-btn"
            @click=${() => this.startFeishuQr()}
          >Scan QR Code to Connect</button>
          <div class="channels__field-help">
            Scan with Feishu app to automatically create and configure a new bot.
          </div>
          ${this.hasInitialCredentials() ? html`
            <button
              class="provider-form__qr-refresh"
              style="margin-top:10px;"
              @click=${() => this.resetForm()}
            >Use Current Bot Credentials</button>
          ` : nothing}
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
            Credentials configured via QR code. Click Save & Connect to apply.
          </div>
          ${this.hasInitialCredentials() ? html`
            <button
              class="provider-form__qr-refresh"
              style="margin-top:10px;"
              @click=${() => this.resetForm()}
            >Restore Current Bot</button>
          ` : nothing}
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

  private renderField(field: CredentialField) {
    const empty = this.saving && field.required && this.isFieldEmpty(field.key)
    const reqMark = field.required ? html`<span class="channels__required-mark">*</span>` : nothing

    // Select
    if (field.type === 'select' && field.options?.length) {
      const value = String(this.formData[field.key] ?? '')
      return html`
        <div class="provider-form__field">
          <label class="provider-form__label">${field.label}${reqMark}</label>
          <select
            class="provider-form__select ${empty ? 'provider-form__select--error' : ''}"
            .value=${value}
            @change=${(e: Event) => {
              this.formData = { ...this.formData, [field.key]: (e.target as HTMLSelectElement).value || undefined }
            }}
          >
            <option value="">-- Select --</option>
            ${field.options!.map(opt => html`
              <option value=${opt.value} ?selected=${value === opt.value}>${opt.label}</option>
            `)}
          </select>
          ${field.help ? html`<div class="channels__field-help">${field.help}</div>` : nothing}
          ${empty ? html`<div class="channels__field-error">${field.label} is required</div>` : nothing}
        </div>
      `
    }

    // Text / password
    const inputType = field.sensitive || field.type === 'password' ? 'password' : 'text'
    return html`
      <div class="provider-form__field">
        <label class="provider-form__label">${field.label}${reqMark}</label>
        <input
          type=${inputType}
          class="provider-form__input ${empty ? 'provider-form__input--error' : ''}"
          placeholder=${field.placeholder ?? ''}
          .value=${String(this.formData[field.key] ?? '')}
          @input=${(e: Event) => {
            this.formData = { ...this.formData, [field.key]: (e.target as HTMLInputElement).value }
          }}
        />
        ${field.help ? html`<div class="channels__field-help">${field.help}</div>` : nothing}
        ${empty ? html`<div class="channels__field-error">${field.label} is required</div>` : nothing}
      </div>
    `
  }
}
