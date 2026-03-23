import { LitElement, html, nothing } from 'lit'
import { customElement, property, state, query } from 'lit/decorators.js'
import type { GatewayClient } from '../gateway/client'
import { svgIcon } from '../components/icons'

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: { id: string; name: string; phase: string; output?: string }[]
  timestamp?: number
}

@customElement('ocbot-chat-view')
export class OcbotChatView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient

  @state() messages: ChatMessage[] = []
  @state() streamingText = ''
  @state() sending = false
  @state() inputText = ''
  @property() sessionKey = 'ocbot:home'
  @state() toolCards: Map<string, { name: string; phase: string; output?: string }> = new Map()

  @query('#chat-input') private inputEl!: HTMLTextAreaElement
  @query('#messages-container') private messagesEl!: HTMLDivElement

  private unsubChat?: () => void
  private unsubAgent?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.loadHistory()

    this.unsubChat = this.gateway.onEvent((event, payload) => {
      if (event !== 'chat') return
      this.handleChatEvent(payload)
    })

    this.unsubAgent = this.gateway.onEvent((event, payload) => {
      if (event !== 'agent') return
      this.handleAgentEvent(payload)
    })
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubChat?.()
    this.unsubAgent?.()
  }

  private async loadHistory() {
    try {
      const result = await this.gateway.call<{ messages?: unknown[] }>('chat.history', {
        sessionKey: this.sessionKey,
        limit: 200,
      })
      if (result?.messages) {
        this.messages = this.normalizeMessages(result.messages)
      }
    } catch {
      // Gateway may not have chat history yet — that's OK
    }
  }

  private normalizeMessages(raw: unknown[]): ChatMessage[] {
    return raw.filter((m: any) => m?.role && m?.content != null).map((m: any) => ({
      role: m.role as 'user' | 'assistant' | 'tool',
      content: typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p: any) => p.type === 'text' ? p.text : `[${p.type}]`).join('')
          : String(m.content ?? ''),
      timestamp: m.timestamp,
    }))
  }

  private handleChatEvent(payload: unknown) {
    const p = payload as { type?: string; text?: string; message?: any; error?: string }
    switch (p?.type) {
      case 'delta':
        this.streamingText += p.text ?? ''
        this.scrollToBottom()
        break
      case 'final':
        if (p.message) {
          this.messages = [...this.messages, {
            role: 'assistant',
            content: typeof p.message.content === 'string'
              ? p.message.content
              : this.streamingText || '[message]',
            timestamp: Date.now(),
          }]
        }
        this.streamingText = ''
        this.toolCards = new Map()
        this.sending = false
        this.scrollToBottom()
        break
      case 'aborted':
        if (this.streamingText) {
          this.messages = [...this.messages, {
            role: 'assistant',
            content: this.streamingText + ' [aborted]',
            timestamp: Date.now(),
          }]
        }
        this.streamingText = ''
        this.toolCards = new Map()
        this.sending = false
        break
      case 'error':
        this.messages = [...this.messages, {
          role: 'assistant',
          content: `Error: ${p.error ?? 'Unknown error'}`,
          timestamp: Date.now(),
        }]
        this.streamingText = ''
        this.sending = false
        break
    }
  }

  private handleAgentEvent(payload: unknown) {
    const p = payload as { stream?: string; phase?: string; toolCallId?: string; toolName?: string; output?: string }
    if (p?.stream !== 'tool') return

    const id = p.toolCallId ?? 'unknown'
    const existing = this.toolCards.get(id) ?? { name: p.toolName ?? 'tool', phase: 'start' }
    const updated = new Map(this.toolCards)
    updated.set(id, {
      ...existing,
      name: p.toolName ?? existing.name,
      phase: p.phase ?? existing.phase,
      output: p.output ?? existing.output,
    })
    this.toolCards = updated
  }

  private async sendMessage() {
    const text = this.inputText.trim()
    if (!text || this.sending) return

    this.messages = [...this.messages, {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }]
    this.inputText = ''
    this.sending = true
    this.streamingText = ''
    this.toolCards = new Map()
    this.scrollToBottom()

    try {
      await this.gateway.call('chat.send', {
        sessionKey: this.sessionKey,
        message: text,
        idempotencyKey: crypto.randomUUID(),
      })
    } catch (err) {
      this.messages = [...this.messages, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      }]
      this.sending = false
    }
  }

  private async abort() {
    try {
      await this.gateway.call('chat.abort', { sessionKey: this.sessionKey })
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
          ${this.messages.length === 0 && !this.streamingText ? html`
            <div class="chat-view__empty">
              <img src="/logo.png" alt="Ocbot" style="width:64px; height:64px; margin-bottom:16px;" />
              <div style="font-size:16px; color:var(--text-strong);">How can I help?</div>
              <div style="font-size:14px; color:var(--muted); margin-top:4px;">Send a message to get started.</div>
            </div>
          ` : nothing}

          ${this.messages.map(m => html`
            <div class="chat-view__msg chat-view__msg--${m.role}">
              <div class="chat-view__msg-content">${m.content}</div>
            </div>
          `)}

          <!-- Tool cards -->
          ${this.toolCards.size > 0 ? html`
            <div class="chat-view__tools">
              ${[...this.toolCards.entries()].map(([id, tc]) => html`
                <div class="chat-view__tool-card">
                  <span class="chat-view__tool-icon">${tc.phase === 'result' ? svgIcon('check', 14) : svgIcon('loader', 14)}</span>
                  <span class="chat-view__tool-name">${tc.name}</span>
                  ${tc.output ? html`<span class="chat-view__tool-output">${tc.output.slice(0, 100)}</span>` : nothing}
                </div>
              `)}
            </div>
          ` : nothing}

          <!-- Streaming text -->
          ${this.streamingText ? html`
            <div class="chat-view__msg chat-view__msg--assistant">
              <div class="chat-view__msg-content">${this.streamingText}<span class="chat-view__cursor">▍</span></div>
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
