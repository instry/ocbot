import { LitElement, html, nothing } from 'lit'
import { customElement, property, state, query } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'
import { renderMarkdown } from '../components/markdown'

// --- Types ---

interface ContentPart {
  type: string
  text?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: ContentPart[] | string
  timestamp?: number
}

interface ToolCard {
  id: string
  name: string
  phase: 'running' | 'done' | 'error'
  output?: string
  startedAt: number
}

interface ChatEventPayload {
  runId?: string
  sessionKey?: string
  state?: 'delta' | 'final' | 'error' | 'aborted'
  message?: { role: string; content: ContentPart[]; timestamp?: number }
  errorMessage?: string
}

interface AgentEventPayload {
  runId?: string
  stream?: string
  sessionKey?: string
  data?: Record<string, unknown>
}

interface GatewayModel {
  id: string
  name: string
  provider: string
}

// --- Helpers ---

function messageText(msg: ChatMessage): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p): p is ContentPart & { text: string } => p.type === 'text' && !!p.text)
      .map(p => p.text)
      .join('')
  }
  return ''
}

// --- Component ---

@customElement('ocbot-chat-view')
export class OcbotChatView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property() sessionKey = 'main'

  @state() messages: ChatMessage[] = []
  @state() streamText = ''
  @state() sending = false
  @state() inputText = ''
  @state() runId: string | null = null
  @state() error: string | null = null
  @state() canonicalSessionKey: string | null = null
  @state() toolCards: Map<string, ToolCard> = new Map()
  @state() models: GatewayModel[] = []
  @state() selectedModel = ''

  @query('#chat-input') private inputEl!: HTMLTextAreaElement
  @query('#messages-container') private messagesEl!: HTMLDivElement

  private unsubEvents?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.loadHistory()
    this.loadModels()

    this.unsubEvents = this.gateway.onEvent((event, payload) => {
      if (event === 'chat') this.handleChatEvent(payload as ChatEventPayload)
      if (event === 'agent') this.handleAgentEvent(payload as AgentEventPayload)
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubEvents?.()
  }

  private async loadModels() {
    try {
      const result = await this.gateway.call<{ models?: GatewayModel[] }>('models.list')
      this.models = result?.models ?? []
      // Get current default model from config
      const config = await this.gateway.call<{ config?: Record<string, any> }>('config.get')
      const primary = config?.config?.agents?.defaults?.model?.primary
      if (primary) this.selectedModel = primary
    } catch { /* ignore */ }
  }

  private async loadHistory() {
    try {
      const result = await this.gateway.call<{
        messages?: Array<{ role: string; content: unknown; timestamp?: number }>
      }>('chat.history', { sessionKey: this.sessionKey, limit: 200 })

      if (result?.messages) {
        this.messages = result.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .filter(m => {
            const text = typeof m.content === 'string'
              ? m.content
              : Array.isArray(m.content)
                ? (m.content as ContentPart[]).map(p => p.text ?? '').join('')
                : ''
            return m.role !== 'assistant' || text.trim() !== 'NO_REPLY'
          })
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content as ContentPart[] | string,
            timestamp: m.timestamp,
          }))
        this.scrollToBottom()
      }
    } catch { /* new session, no history */ }
  }

  // --- Event handlers ---

  private handleChatEvent(payload: ChatEventPayload) {
    if (this.runId && payload.runId && payload.runId !== this.runId) return
    if (payload.sessionKey && !this.canonicalSessionKey) {
      this.canonicalSessionKey = payload.sessionKey
    }

    switch (payload.state) {
      case 'delta': {
        const text = payload.message?.content
          ?.filter(p => p.type === 'text')
          .map(p => p.text ?? '')
          .join('') ?? ''
        this.streamText = text
        this.scrollToBottom()
        break
      }
      case 'final': {
        if (payload.message) {
          const text = payload.message.content
            ?.filter(p => p.type === 'text')
            .map(p => p.text ?? '')
            .join('') ?? ''
          if (text.trim() && text.trim() !== 'NO_REPLY') {
            this.messages = [...this.messages, {
              role: 'assistant',
              content: payload.message.content,
              timestamp: payload.message.timestamp ?? Date.now(),
            }]
          }
        }
        this.streamText = ''
        this.runId = null
        this.sending = false
        this.toolCards = new Map()
        this.scrollToBottom()
        break
      }
      case 'aborted': {
        if (this.streamText.trim()) {
          this.messages = [...this.messages, {
            role: 'assistant',
            content: [{ type: 'text', text: this.streamText }],
            timestamp: Date.now(),
          }]
        }
        this.streamText = ''
        this.runId = null
        this.sending = false
        this.toolCards = new Map()
        break
      }
      case 'error': {
        this.error = payload.errorMessage ?? 'An error occurred'
        this.streamText = ''
        this.runId = null
        this.sending = false
        this.toolCards = new Map()
        break
      }
    }
  }

  private handleAgentEvent(payload: AgentEventPayload) {
    if (this.runId && payload.runId && payload.runId !== this.runId) return
    if (payload.stream !== 'tool' || !payload.data) return

    const data = payload.data
    const toolCallId = (data.toolCallId ?? data.id ?? '') as string
    if (!toolCallId) return

    const existing = this.toolCards.get(toolCallId)
    const updated = new Map(this.toolCards)
    const phase = (data.phase ?? data.state ?? 'running') as string

    updated.set(toolCallId, {
      id: toolCallId,
      name: (data.toolName ?? data.name ?? existing?.name ?? 'tool') as string,
      phase: phase === 'result' || phase === 'done' ? 'done' : phase === 'error' ? 'error' : 'running',
      output: (data.output ?? data.result ?? existing?.output) as string | undefined,
      startedAt: existing?.startedAt ?? Date.now(),
    })
    this.toolCards = updated
    this.scrollToBottom()
  }

  // --- Actions ---

  private async sendMessage() {
    const text = this.inputText.trim()
    if (!text || this.sending) return
    this.error = null

    this.messages = [...this.messages, {
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
    }]
    this.inputText = ''
    this.sending = true
    this.streamText = ''
    this.toolCards = new Map()

    // Reset textarea height
    if (this.inputEl) this.inputEl.style.height = 'auto'

    const idempotencyKey = crypto.randomUUID()
    this.runId = idempotencyKey
    this.scrollToBottom()

    try {
      await this.gateway.call('chat.send', {
        sessionKey: this.sessionKey,
        message: text,
        idempotencyKey,
      })
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.sending = false
      this.runId = null
    }
  }

  private async abort() {
    try {
      await this.gateway.call('chat.abort', {
        sessionKey: this.sessionKey,
        runId: this.runId,
      })
    } catch { /* best effort */ }
  }

  private newSession() {
    this.messages = []
    this.streamText = ''
    this.error = null
    this.toolCards = new Map()
    this.canonicalSessionKey = null
    // Use a unique session key for new conversations
    this.sessionKey = `ocbot:${Date.now()}`
    this.dispatchEvent(new CustomEvent('session-changed', {
      detail: this.sessionKey, bubbles: true, composed: true,
    }))
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      this.sendMessage()
    }
  }

  private handleInput(e: Event) {
    const el = e.target as HTMLTextAreaElement
    this.inputText = el.value
    // Auto-resize
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      if (this.messagesEl) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight
      }
    })
  }

  // --- Render ---

  override render() {
    return html`
      <div class="chat-view">
        <!-- Header -->
        <div class="chat-view__header">
          ${this.models.length ? html`
            <select
              class="chat-view__model-select"
              .value=${this.selectedModel}
              @change=${(e: Event) => { this.selectedModel = (e.target as HTMLSelectElement).value }}
            >
              ${this.models.map(m => html`
                <option value="${m.provider}/${m.id}" ?selected=${`${m.provider}/${m.id}` === this.selectedModel}>
                  ${m.name || m.id} (${m.provider})
                </option>
              `)}
            </select>
          ` : html`<span class="chat-view__session">Chat</span>`}
          <span style="flex:1"></span>
          ${this.sending ? html`
            <button class="btn btn--sm" @click=${this.abort}>${svgIcon('x', 14)} Stop</button>
          ` : nothing}
          <button class="btn btn--sm" @click=${this.newSession} title="New chat">${svgIcon('plus', 14)}</button>
        </div>

        <!-- Messages -->
        <div class="chat-view__messages" id="messages-container">
          ${this.messages.length === 0 && !this.streamText ? html`
            <div class="chat-view__empty">
              <img src="/logo.png" alt="Ocbot" style="width:64px; height:64px; margin-bottom:16px;" />
              <div style="font-size:16px; color:var(--text-strong);">How can I help?</div>
              <div style="font-size:14px; color:var(--muted); margin-top:4px;">Send a message to get started.</div>
            </div>
          ` : nothing}

          ${this.messages.map(m => this._renderMessage(m))}

          <!-- Tool cards (during streaming) -->
          ${this.toolCards.size > 0 ? html`
            <div class="chat-view__tools">
              ${[...this.toolCards.values()].map(tc => html`
                <div class="chat-view__tool-card chat-view__tool-card--${tc.phase}">
                  <span class="chat-view__tool-icon">
                    ${tc.phase === 'done' ? svgIcon('check', 14)
                      : tc.phase === 'error' ? svgIcon('circle-x', 14)
                      : svgIcon('loader', 14)}
                  </span>
                  <span class="chat-view__tool-name">${tc.name}</span>
                  ${tc.output ? html`
                    <span class="chat-view__tool-output">${tc.output.slice(0, 120)}</span>
                  ` : nothing}
                </div>
              `)}
            </div>
          ` : nothing}

          <!-- Streaming text -->
          ${this.streamText ? html`
            <div class="chat-view__msg chat-view__msg--assistant">
              <div class="chat-view__msg-content chat-view__markdown">
                ${unsafeHTML(renderMarkdown(this.streamText))}
                <span class="chat-view__cursor">▍</span>
              </div>
            </div>
          ` : nothing}

          <!-- Error -->
          ${this.error ? html`
            <div class="chat-view__error">${this.error}</div>
          ` : nothing}
        </div>

        <!-- Input -->
        <div class="chat-view__input-area">
          <textarea
            id="chat-input"
            class="chat-view__textarea"
            placeholder="Send a message... (Shift+Enter for new line)"
            .value=${this.inputText}
            @input=${this.handleInput}
            @keydown=${this.handleKeyDown}
            ?disabled=${this.sending}
            rows="1"
          ></textarea>
          <button
            class="chat-view__send-btn"
            @click=${this.sending ? this.abort : this.sendMessage}
            ?disabled=${!this.inputText.trim() && !this.sending}
          >
            ${this.sending ? svgIcon('x', 16) : svgIcon('chat', 16)}
          </button>
        </div>
      </div>
    `
  }

  private _renderMessage(m: ChatMessage) {
    const text = messageText(m)
    if (m.role === 'user') {
      return html`
        <div class="chat-view__msg chat-view__msg--user">
          <div class="chat-view__msg-content">${text}</div>
        </div>
      `
    }
    // Assistant: render as markdown
    return html`
      <div class="chat-view__msg chat-view__msg--assistant">
        <div class="chat-view__msg-content chat-view__markdown">
          ${unsafeHTML(renderMarkdown(text))}
        </div>
      </div>
    `
  }
}
