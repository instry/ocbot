import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'

@customElement('ocbot-config-view')
export class OcbotConfigView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() rawConfig = ''
  @state() editHash = ''
  @state() saving = false
  @state() saveError: string | null = null
  @state() saveSuccess = false
  @state() loading = true

  override connectedCallback() {
    super.connectedCallback()
    this.loadConfig()
  }

  private async loadConfig() {
    this.loading = true
    this.saveError = null
    this.saveSuccess = false
    try {
      const result = await this.gateway.call<{ raw?: string; hash?: string; config?: object }>('config.get')
      this.rawConfig = result?.raw ?? JSON.stringify(result?.config ?? {}, null, 2)
      this.editHash = result?.hash ?? ''
    } catch (err) {
      this.saveError = err instanceof Error ? err.message : String(err)
    } finally {
      this.loading = false
    }
  }

  private async saveConfig() {
    this.saving = true
    this.saveError = null
    this.saveSuccess = false
    try {
      const result = await this.gateway.call<{ hash?: string }>('config.apply', {
        baseHash: this.editHash,
        raw: this.rawConfig,
      })
      if (result?.hash) {
        this.editHash = result.hash
      }
      this.saveSuccess = true
      setTimeout(() => { this.saveSuccess = false }, 3000)
    } catch (err) {
      this.saveError = err instanceof Error ? err.message : String(err)
    } finally {
      this.saving = false
    }
  }

  private handleInput(e: Event) {
    this.rawConfig = (e.target as HTMLTextAreaElement).value
    this.saveSuccess = false
    this.saveError = null
  }

  override render() {
    return html`
      <div style="padding:20px; height:100%; display:flex; flex-direction:column;">
        <div style="display:flex; align-items:center; margin-bottom:16px;">
          <h2 style="font-size:20px; font-weight:600; color:var(--text-strong); margin:0;">Configuration</h2>
          <span style="flex:1"></span>
          <button class="btn btn--sm" @click=${() => this.loadConfig()} style="margin-right:8px;">Reload</button>
          <button
            class="btn"
            @click=${this.saveConfig}
            ?disabled=${this.saving || this.loading}
          >${this.saving ? 'Saving...' : 'Save'}</button>
        </div>

        ${this.loading ? html`
          <div style="text-align:center; color:var(--muted); padding:40px;">Loading...</div>
        ` : html`
          <textarea
            style="
              flex:1;
              width:100%;
              font-family:'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
              font-size:13px;
              line-height:1.5;
              padding:12px;
              border:1px solid var(--border);
              border-radius:8px;
              background:var(--surface, var(--bg));
              color:var(--text);
              resize:none;
              outline:none;
              tab-size:2;
              box-sizing:border-box;
            "
            .value=${this.rawConfig}
            @input=${this.handleInput}
            spellcheck="false"
          ></textarea>
        `}

        ${this.saveError ? html`
          <div style="
            margin-top:12px; padding:8px 12px;
            border-radius:6px;
            background:color-mix(in srgb, var(--danger, #e53e3e) 10%, transparent);
            color:var(--danger, #e53e3e);
            font-size:13px;
          ">${this.saveError}</div>
        ` : nothing}

        ${this.saveSuccess ? html`
          <div style="
            margin-top:12px; padding:8px 12px;
            border-radius:6px;
            background:color-mix(in srgb, var(--success, #38a169) 10%, transparent);
            color:var(--success, #38a169);
            font-size:13px;
          ">Configuration saved successfully.</div>
        ` : nothing}
      </div>
    `
  }
}
