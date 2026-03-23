import { LitElement, html, nothing } from 'lit'
import { customElement, property, state, query } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'

/**
 * Message content part — Anthropic-style content array.
 * Each message has content: Array<{ type: "text", text: string } | ...>
 */
interface ContentPart {
  type: string
  text?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: ContentPart[] | string
  timestamp?: number
}

/** Extract display text from a message's content (string or content array) */
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

/** Chat event payload from gateway */
interface ChatEventPayload {
  runId?: string
  sessionKey?: string
  state?: 'delta' | 'final' | 'error' | 'aborted'
  message?: {
    role: string
    content: ContentPart[]
    timestamp?: number
  }
  errorMessage?: string
}

@customElement('ocbot-chat-view')
export class OcbotChatView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property() sessionKey = 'main'

  @state() messages: ChatMessage[] = []
  @state() streamText = ''  // cumulative streaming text from delta events
  @state() sending = false
  @state() inputText = ''
  @state() runId: string | null = null  // current run correlation ID
  @state() error: string | null = null
  @state() canonicalSessionKey: string | null = null  // gateway-resolved key

  @query('#chat-input') private inputEl!: HTMLTextAreaElement
  @query('#messages-container') private messagesEl!: HTMLDivElement

  private unsubChat?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.loadHistory()

    // Listen to 'chat' events from gateway
    this.unsubChat = this.gateway.onEvent((event, payload) => {
      if (event === 'chat') {
        this.handleChatEvent(payload as ChatEventPayload)
      }
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubChat?.()
  }

  private async loadHistory() {
    try {
      const result = await this.gateway.call<{
        messages?: Array<{ role: string; content: unknown; timestamp?: number }>
      }>('chat.history', {
        sessionKey: this.sessionKey,
        limit: 200,
      })

      if (result?.messages) {
        this.messages = result.messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .filter(m => {
            // Filter out NO_REPLY assistant messages
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
    } catch {
      // History not available — that's OK for new sessions
    }
  }

  private handleChatEvent(payload: ChatEventPayload) {
    // Match by runId if available (most reliable), otherwise accept all chat events
    if (this.runId && payload.runId && payload.runId !== this.runId) return

    // Track the canonical sessionKey from gateway (e.g. "agent:main:ocbot:home")
    if (payload.sessionKey && !this.canonicalSessionKey) {
      this.canonicalSessionKey = payload.sessionKey
    }

    switch (payload.state) {
      case 'delta': {
        // Delta contains CUMULATIVE text (full text so far, not just the new chunk)
        const text = payload.message?.content
          ?.filter(p => p.type === 'text')
          .map(p => p.text ?? '')
          .join('') ?? ''
        this.streamText = text
        this.scrollToBottom()
        break
      }

      case 'final': {
        // Final message — add to messages, clear streaming state
        if (payload.message) {
          const text = payload.message.content
            ?.filter(p => p.type === 'text')
            .map(p => p.text ?? '')
            .join('') ?? ''
          // Skip NO_REPLY
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
        this.scrollToBottom()
        break
      }

      case 'aborted': {
        // Partial response on abort
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
        break
      }

      case 'error': {
        this.error = payload.errorMessage ?? 'An error occurred'
        this.streamText = ''
        this.runId = null
        this.sending = false
        break
      }
    }
  }

  private async sendMessage() {
    const text = this.inputText.trim()
    if (!text || this.sending) return

    this.error = null

    // Add optimistic user message
    this.messages = [...this.messages, {
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
    }]
    this.inputText = ''
    this.sending = true
    this.streamText = ''

    const idempotencyKey = crypto.randomUUID()
    this.runId = idempotencyKey

    this.scrollToBottom()

    try {
      const result = await this.gateway.call('chat.send', {
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

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      this.sendMessage()
    }
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      if (this.messagesEl) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight
      }
    })
  }

  override render() {
    return html`
      <div class="chat-view">
        <!-- Header -->
        <div class="chat-view__header">
          <span class="chat-view__session">${this.sessionKey}</span>
          <span style="flex:1"></span>
          ${this.sending ? html`
            <button class="btn btn--sm" @click=${this.abort}>Stop</button>
          ` : nothing}
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

          ${this.messages.map(m => html`
            <div class="chat-view__msg chat-view__msg--${m.role}">
              <div class="chat-view__msg-content">${messageText(m)}</div>
            </div>
          `)}

          <!-- Streaming text (cumulative) -->
          ${this.streamText ? html`
            <div class="chat-view__msg chat-view__msg--assistant">
              <div class="chat-view__msg-content">${this.streamText}<span class="chat-view__cursor">▍</span></div>
            </div>
          ` : nothing}

          <!-- Error -->
          ${this.error ? html`
            <div style="padding:8px 14px; margin:8px 0; border-radius:var(--radius-md); background:var(--danger-subtle); color:var(--danger); font-size:13px;">
              ${this.error}
            </div>
          ` : nothing}
        </div>

        <!-- Input -->
        <div class="chat-view__input-area">
          <textarea
            id="chat-input"
            class="chat-view__textarea"
            placeholder="Ask anything..."
            .value=${this.inputText}
            @input=${(e: Event) => { this.inputText = (e.target as HTMLTextAreaElement).value }}
            @keydown=${this.handleKeyDown}
            ?disabled=${this.sending}
            rows="1"
          ></textarea>
          <button
            class="chat-view__send-btn"
            @click=${this.sending ? this.abort : this.sendMessage}
            ?disabled=${!this.inputText.trim() && !this.sending}
          >${this.sending ? 'Stop' : 'Send'}</button>
        </div>
      </div>
    `
  }
}
