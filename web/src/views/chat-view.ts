import { LitElement, html, nothing, type PropertyValues } from 'lit'
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
  args?: string
  startedAt: number
  expanded: boolean
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

function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// --- Component ---

@customElement('ocbot-chat-view')
export class OcbotChatView extends LitElement {
  override createRenderRoot() { return this }

  @property({ attribute: false }) gateway!: GatewayClient
  @property() sessionKey = 'main'
  @property({ type: Boolean }) panelOpen = true

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

  // Input history
  private inputHistory: string[] = []
  private historyIndex = -1

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

  override willUpdate(changed: PropertyValues) {
    if (changed.has('sessionKey') && changed.get('sessionKey') !== undefined) {
      // sessionKey changed, reload history for new session
      this.messages = []
      this.streamText = ''
      this.error = null
      this.toolCards = new Map()
      this.canonicalSessionKey = null
      this.loadHistory()
    }
  }

  private async loadModels() {
    try {
      const result = await this.gateway.call<{ models?: GatewayModel[] }>('models.list')
      this.models = result?.models ?? []
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
    } catch { /* new session */ }
  }

  // --- Event handlers (same logic as before) ---

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
      args: (data.arguments ?? existing?.args) as string | undefined,
      startedAt: existing?.startedAt ?? Date.now(),
      expanded: existing?.expanded ?? false,
    })
    this.toolCards = updated
    this.scrollToBottom()
  }

  // --- Actions ---

  private async sendMessage() {
    const text = this.inputText.trim()
    if (!text || this.sending) return
    this.error = null

    // Save to input history
    if (this.inputHistory[this.inputHistory.length - 1] !== text) {
      this.inputHistory.push(text)
    }
    this.historyIndex = -1

    this.messages = [...this.messages, {
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
    }]
    this.inputText = ''
    this.sending = true
    this.streamText = ''
    this.toolCards = new Map()

    if (this.inputEl) this.inputEl.style.height = 'auto'

    const idempotencyKey = crypto.randomUUID()
    this.runId = idempotencyKey
    this.scrollToBottom()

    try {
      await this.gateway.call('chat.send', {
        sessionKey: this.sessionKey,
        message: text,
        idempotencyKey,
        ...(this.selectedModel ? { model: this.selectedModel } : {}),
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
    this.sessionKey = `ocbot:${Date.now()}`
    this.dispatchEvent(new CustomEvent('session-changed', {
      detail: this.sessionKey, bubbles: true, composed: true,
    }))
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      this.sendMessage()
      return
    }
    // Input history navigation
    if (e.key === 'ArrowUp' && this.inputText === '') {
      e.preventDefault()
      if (this.inputHistory.length > 0) {
        if (this.historyIndex === -1) {
          this.historyIndex = this.inputHistory.length - 1
        } else if (this.historyIndex > 0) {
          this.historyIndex--
        }
        this.inputText = this.inputHistory[this.historyIndex]
      }
      return
    }
    if (e.key === 'ArrowDown' && this.historyIndex >= 0) {
      e.preventDefault()
      if (this.historyIndex < this.inputHistory.length - 1) {
        this.historyIndex++
        this.inputText = this.inputHistory[this.historyIndex]
      } else {
        this.historyIndex = -1
        this.inputText = ''
      }
    }
  }

  private handleInput(e: Event) {
    const el = e.target as HTMLTextAreaElement
    this.inputText = el.value
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
    // Reset history navigation when typing
    this.historyIndex = -1
  }

  private toggleToolCard(id: string) {
    const card = this.toolCards.get(id)
    if (!card) return
    const updated = new Map(this.toolCards)
    updated.set(id, { ...card, expanded: !card.expanded })
    this.toolCards = updated
  }

  private copyMessage(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      if (this.messagesEl) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight
      }
    })
  }

  private togglePanel() {
    this.dispatchEvent(new CustomEvent('toggle-panel', { bubbles: true, composed: true }))
  }

  // --- Render ---

  override render() {
    const hasMessages = this.messages.length > 0 || !!this.streamText

    return html`
      <div class="chat-view">
        <!-- Header -->
        <div class="chat-view__header">
          <button class="chat-view__header-btn" @click=${this.togglePanel} title="${this.panelOpen ? 'Hide sidebar' : 'Show sidebar'}">
            ${svgIcon(this.panelOpen ? 'panel-left-close' : 'panel-left', 16)}
          </button>
          <span style="flex:1"></span>
          ${this.sending ? html`
            <button class="btn btn--sm btn--danger" @click=${this.abort}>${svgIcon('x', 14)} Stop</button>
          ` : nothing}
          <button class="chat-view__header-btn" @click=${this.newSession} title="New chat">
            ${svgIcon('square-pen', 16)}
          </button>
        </div>

        <!-- Messages -->
        <div class="chat-view__messages" id="messages-container">
          ${!hasMessages ? this._renderWelcome() : html`
            ${this.messages.map((m, i) => this._renderMessage(m, i))}

            ${this.toolCards.size > 0 ? this._renderToolCards() : nothing}

            ${this.streamText ? this._renderStreaming() : nothing}

            ${this.error ? html`
              <div class="chat-view__error">${this.error}</div>
            ` : nothing}
          `}
        </div>

        <!-- Input Area -->
        ${this._renderInput(hasMessages)}
      </div>
    `
  }

  private _renderWelcome() {
    return html`
      <div class="chat-view__welcome">
        <img src="/logo.png" alt="Ocbot" class="chat-view__welcome-logo" />
        <div class="chat-view__welcome-title">How can I help?</div>
      </div>
    `
  }

  private _renderMessage(m: ChatMessage, index: number) {
    const text = messageText(m)
    const time = formatTime(m.timestamp)

    // Check if this is the first message in a group (different role from previous)
    const prev = index > 0 ? this.messages[index - 1] : null
    const isGroupStart = !prev || prev.role !== m.role

    if (m.role === 'user') {
      return html`
        <div class="cv-msg cv-msg--user">
          <div class="cv-msg__bubble">${text}</div>
          ${time ? html`<div class="cv-msg__time">${time}</div>` : nothing}
        </div>
      `
    }

    // Assistant message
    return html`
      <div class="cv-msg cv-msg--assistant ${isGroupStart ? 'cv-msg--group-start' : ''}">
        ${isGroupStart ? html`
          <div class="cv-msg__header">
            <div class="cv-msg__avatar">
              <img src="/logo.png" alt="" width="24" height="24" />
            </div>
            <span class="cv-msg__name">Ocbot</span>
            ${time ? html`<span class="cv-msg__time">${time}</span>` : nothing}
          </div>
        ` : nothing}
        <div class="cv-msg__body">
          <div class="cv-msg__content cv-markdown">
            ${unsafeHTML(renderMarkdown(text))}
          </div>
          <button class="cv-msg__copy" @click=${() => this.copyMessage(text)} title="Copy">
            ${svgIcon('copy', 14)}
          </button>
        </div>
      </div>
    `
  }

  private _renderToolCards() {
    const cards = [...this.toolCards.values()]
    return html`
      <div class="cv-msg cv-msg--assistant cv-msg--group-start">
        <div class="cv-msg__header">
          <div class="cv-msg__avatar">
            <img src="/logo.png" alt="" width="24" height="24" />
          </div>
          <span class="cv-msg__name">Ocbot</span>
        </div>
        <div class="cv-tools">
          ${cards.map(tc => html`
            <div class="cv-tool cv-tool--${tc.phase}">
              <button class="cv-tool__header" @click=${() => this.toggleToolCard(tc.id)}>
                <span class="cv-tool__icon">
                  ${tc.phase === 'done' ? svgIcon('check', 14)
                    : tc.phase === 'error' ? svgIcon('circle-x', 14)
                    : svgIcon('loader', 14)}
                </span>
                <span class="cv-tool__name">${tc.name}</span>
                <span style="flex:1"></span>
                <span class="cv-tool__chevron ${tc.expanded ? 'cv-tool__chevron--open' : ''}">
                  ${svgIcon('chevron-right', 12)}
                </span>
              </button>
              ${tc.expanded && tc.output ? html`
                <div class="cv-tool__detail">
                  <pre class="cv-tool__output">${tc.output}</pre>
                </div>
              ` : nothing}
            </div>
          `)}
        </div>
      </div>
    `
  }

  private _renderStreaming() {
    return html`
      <div class="cv-msg cv-msg--assistant cv-msg--group-start">
        <div class="cv-msg__header">
          <div class="cv-msg__avatar">
            <img src="/logo.png" alt="" width="24" height="24" />
          </div>
          <span class="cv-msg__name">Ocbot</span>
        </div>
        <div class="cv-msg__body">
          <div class="cv-msg__content cv-markdown">
            ${unsafeHTML(renderMarkdown(this.streamText))}
            <span class="chat-view__cursor">▍</span>
          </div>
        </div>
      </div>
    `
  }

  private _renderInput(hasMessages: boolean) {
    return html`
      <div class="cv-input ${hasMessages ? '' : 'cv-input--centered'}">
        <div class="cv-input__box">
          <button class="cv-input__attach" title="Attach file">
            ${svgIcon('paperclip', 16)}
          </button>
          <textarea
            id="chat-input"
            class="cv-input__textarea"
            placeholder="Send a message..."
            .value=${this.inputText}
            @input=${this.handleInput}
            @keydown=${this.handleKeyDown}
            ?disabled=${this.sending}
            rows="1"
          ></textarea>
          <button
            class="cv-input__send ${this.sending ? 'cv-input__send--stop' : ''}"
            @click=${this.sending ? this.abort : this.sendMessage}
            ?disabled=${!this.inputText.trim() && !this.sending}
          >
            ${this.sending ? svgIcon('x', 16) : svgIcon('arrow-up', 16)}
          </button>
        </div>
        <div class="cv-input__footer">
          ${this.models.length ? html`
            <select
              class="cv-input__model"
              .value=${this.selectedModel}
              @change=${(e: Event) => { this.selectedModel = (e.target as HTMLSelectElement).value }}
            >
              ${this.models.map(m => html`
                <option value="${m.provider}/${m.id}" ?selected=${`${m.provider}/${m.id}` === this.selectedModel}>
                  ${m.name || m.id}
                </option>
              `)}
            </select>
          ` : nothing}
        </div>
      </div>
    `
  }
}
