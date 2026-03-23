import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'

@customElement('ocbot-sidepanel')
export class OcbotSidepanel extends LitElement {
  override createRenderRoot() { return this }

  @state() gatewayState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'

  override connectedCallback() {
    super.connectedCallback()
    // TODO: connect to gateway in Phase 1
    this.gatewayState = 'connected'
  }

  override render() {
    return html`
      <div style="display:flex; flex-direction:column; height:100vh; background:var(--bg); color:var(--text);">
        <!-- Header -->
        <div style="display:flex; align-items:center; gap:8px; padding:12px 16px; border-bottom:1px solid var(--border);">
          <span style="font-size:16px;">🐙</span>
          <span style="font-weight:600; font-size:14px; color:var(--text-strong);">Ocbot</span>
          <span style="font-size:12px; color:var(--ok);">●</span>
          <span style="flex:1;"></span>
          <button style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:18px;" title="New chat">+</button>
        </div>

        <!-- Chat area (placeholder) -->
        <div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--muted);">
          <div style="text-align:center;">
            <div style="font-size:32px; margin-bottom:8px;">🐙</div>
            <div>Chat coming in Phase 1</div>
          </div>
        </div>

        <!-- Input (placeholder) -->
        <div style="padding:12px 16px; border-top:1px solid var(--border);">
          <div style="display:flex; gap:8px;">
            <input
              type="text"
              placeholder="Ask anything..."
              disabled
              style="flex:1; padding:8px 12px; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--bg-elevated); color:var(--text); font-size:14px;"
            />
            <button
              disabled
              style="padding:8px 16px; border:none; border-radius:var(--radius-md); background:var(--accent); color:var(--accent-foreground); font-size:14px; cursor:pointer; opacity:0.5;"
            >Send</button>
          </div>
        </div>
      </div>
    `
  }
}
