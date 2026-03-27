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
  @state() modelPopoverOpen = false
  @state() modelSearch = ''

  // Providers whose baseUrl matches a CN region endpoint
  private cnProviders = new Set<string>()

  // Input history
  private inputHistory: string[] = []
  private historyIndex = -1
  private titleGenerated = false

  @query('#chat-input') private inputEl!: HTMLTextAreaElement
  @query('#messages-container') private messagesEl!: HTMLDivElement

  private unsubEvents?: () => void
  private boundClosePopover = (e: MouseEvent) => {
    const popover = (e.target as Element)?.closest?.('.cv-model-popover, .cv-input__model-btn')
    if (!popover) this.modelPopoverOpen = false
  }

  override connectedCallback() {
    super.connectedCallback()
    this.loadHistory()
    this.loadModels()

    this.unsubEvents = this.gateway.onEvent((event, payload) => {
      if (event === 'chat') this.handleChatEvent(payload as ChatEventPayload)
      if (event === 'agent') this.handleAgentEvent(payload as AgentEventPayload)
    })
    document.addEventListener('mousedown', this.boundClosePopover)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.unsubEvents?.()
    document.removeEventListener('mousedown', this.boundClosePopover)
  }

  override willUpdate(changed: PropertyValues) {
    if (changed.has('sessionKey') && changed.get('sessionKey') !== undefined) {
      // sessionKey changed, reload history for new session
      this.messages = []
      this.streamText = ''
      this.error = null
      this.toolCards = new Map()
      this.canonicalSessionKey = null
      this.titleGenerated = false
      this.loadHistory()
    }
  }

  // CN region base URLs keyed by provider
  private static CN_URLS: Record<string, string> = {
    minimax: 'https://api.minimaxi.com',
    zai: 'https://open.bigmodel.cn',
    moonshot: 'https://api.moonshot.cn',
    qwen: 'https://dashscope.aliyuncs.com',
  }

  private async loadModels() {
    try {
      const [modelsResult, configResult] = await Promise.all([
        this.gateway.call<{ models?: GatewayModel[] }>('models.list'),
        this.gateway.call<{ config?: Record<string, any> }>('config.get'),
      ])
      const config = configResult?.config ?? {}
      const profiles: Record<string, any> = config?.auth?.profiles ?? {}
      // Extract configured provider names and detect CN regions
      const configuredProviders = new Set<string>()
      const cn = new Set<string>()
      for (const [key, profile] of Object.entries(profiles)) {
        const provider = profile.provider ?? key.split(':')[0]
        configuredProviders.add(provider)
        const baseUrl: string = profile.baseUrl ?? ''
        const cnUrl = OcbotChatView.CN_URLS[provider]
        if (cnUrl && baseUrl.startsWith(cnUrl)) {
          cn.add(provider)
        }
      }
      this.cnProviders = cn
      // Only show models from configured providers
      const allModels = modelsResult?.models ?? []
      this.models = allModels.filter(m => configuredProviders.has(m.provider))

      const primary = config?.agents?.defaults?.model?.primary
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
        // Mark title as already generated for existing sessions
        if (this.messages.length > 0) this.titleGenerated = true
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
        this.maybeGenerateTitle()
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

  private async maybeGenerateTitle() {
    if (this.titleGenerated) return
    // Only generate after the first exchange (1 user + 1 assistant)
    const userMsgs = this.messages.filter(m => m.role === 'user')
    const assistantMsgs = this.messages.filter(m => m.role === 'assistant')
    if (userMsgs.length !== 1 || assistantMsgs.length !== 1) return
    this.titleGenerated = true

    const userText = messageText(userMsgs[0]).trim()
    if (!userText) return

    // Use first user message (truncated) as the title
    const title = userText.length > 30
      ? userText.slice(0, 29) + '…'
      : userText

    try {
      await this.gateway.call('sessions.patch', {
        key: this.sessionKey,
        label: title,
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
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
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
    this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        const scrollContainer = this.querySelector('.chat-view')
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight
        }
      })
    })
  }

  // --- Render ---

  override render() {
    const hasMessages = this.messages.length > 0 || !!this.streamText

    return html`
      <div class="chat-view">
        <div class="chat-view__messages" id="messages-container">
          ${!hasMessages ? this._renderWelcome() : html`
            ${this.messages.map((m, i) => this._renderMessage(m, i))}

            ${this.toolCards.size > 0 ? this._renderToolCards() : nothing}

            ${this.sending && !this.streamText && this.toolCards.size === 0 ? this._renderThinking() : nothing}

            ${this.streamText ? this._renderStreaming() : nothing}

            ${this.error ? html`
              <div class="chat-view__error">${this.error}</div>
            ` : nothing}
          `}
        </div>

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

  private _renderThinking() {
    return html`
      <div class="cv-msg cv-msg--assistant cv-msg--group-start">
        <div class="cv-msg__header">
          <div class="cv-msg__avatar">
            <img src="/logo.png" alt="" width="24" height="24" />
          </div>
          <span class="cv-msg__name">Ocbot</span>
        </div>
        <div class="cv-msg__body">
          <div class="cv-msg__thinking">
            <span class="cv-msg__thinking-dot"></span>
            <span class="cv-msg__thinking-dot"></span>
            <span class="cv-msg__thinking-dot"></span>
          </div>
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
    const modelDisplay = this._getSelectedModelDisplay()

    return html`
      <div class="cv-input ${hasMessages ? '' : 'cv-input--centered'}">
        <div class="cv-input__inner">
        <div class="cv-input__box">
          <textarea
            id="chat-input"
            class="cv-input__textarea"
            placeholder="Send a message..."
            .value=${this.inputText}
            @input=${this.handleInput}
            @keydown=${this.handleKeyDown}
            ?disabled=${this.sending}
            rows="1"
            maxlength="20000"
          ></textarea>
          <div class="cv-input__footer">
            <div class="cv-input__footer-left">
              ${this.models.length ? html`
                <div class="cv-input__model-wrap">
                  <button
                    class="cv-input__model-btn"
                    @click=${() => { this.modelPopoverOpen = !this.modelPopoverOpen; this.modelSearch = '' }}
                  >
                    <span class="cv-input__model-name">${modelDisplay}</span>
                    ${svgIcon('chevron-down', 12)}
                  </button>
                  ${this.modelPopoverOpen ? this._renderModelPopover() : nothing}
                </div>
              ` : nothing}
            </div>
            <div class="cv-input__footer-right">
              <button class="cv-input__attach" title="Attach file">
                ${svgIcon('paperclip', 16)}
              </button>
              <button
                class="cv-input__send ${this.sending ? 'cv-input__send--stop' : ''}"
                @click=${this.sending ? this.abort : this.sendMessage}
                ?disabled=${!this.inputText.trim() && !this.sending}
              >
                ${this.sending ? svgIcon('square', 16) : svgIcon('arrow-up', 16)}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    `
  }

  private _modelDisplayName(m: GatewayModel): string {
    const name = m.name || m.id
    return this.cnProviders.has(m.provider) ? `${name}-CN` : name
  }

  private _getSelectedModelDisplay(): string {
    if (!this.selectedModel) return 'Select model'
    const m = this.models.find(m => `${m.provider}/${m.id}` === this.selectedModel)
    return m ? this._modelDisplayName(m) : this.selectedModel.split('/').pop() ?? this.selectedModel
  }

  private _renderModelPopover() {
    const q = this.modelSearch.toLowerCase().trim()
    const providerLabels: Record<string, string> = {
      anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google',
      deepseek: 'DeepSeek', xai: 'xAI', openrouter: 'OpenRouter',
      mistral: 'Mistral', qwen: 'Qwen', moonshot: 'Kimi / Moonshot',
      minimax: 'MiniMax', ollama: 'Ollama', zai: 'Zhipu Z-AI',
    }
    // Group models by provider
    const groups: { name: string; label: string; items: GatewayModel[] }[] = []
    for (const m of this.models) {
      const displayName = (m.name || m.id).toLowerCase()
      if (q && !m.provider.toLowerCase().includes(q) && !displayName.includes(q)) continue
      let group = groups.find(g => g.name === m.provider)
      if (!group) {
        group = { name: m.provider, label: providerLabels[m.provider] ?? m.provider, items: [] }
        groups.push(group)
      }
      group.items.push(m)
    }

    return html`
      <div class="cv-model-popover" @keydown=${(e: KeyboardEvent) => { if (e.key === 'Escape') this.modelPopoverOpen = false }}>
        <div class="cv-model-popover__search">
          ${svgIcon('search', 14)}
          <input
            type="text"
            class="cv-model-popover__search-input"
            placeholder="Search models..."
            .value=${this.modelSearch}
            @input=${(e: Event) => { this.modelSearch = (e.target as HTMLInputElement).value }}
          />
          <button
            class="cv-model-popover__add-btn"
            title="Add model"
            @click=${() => { this.modelPopoverOpen = false; this._navigateToSettings() }}
          >${svgIcon('plus', 14)}</button>
        </div>
        <div class="cv-model-popover__list">
          ${groups.length === 0 ? html`
            <div class="cv-model-popover__empty">
              ${this.models.length === 0 ? html`
                <span>No models configured</span>
                <button class="cv-model-popover__empty-link" @click=${() => { this.modelPopoverOpen = false; this._navigateToSettings() }}>Add a model</button>
              ` : html`<span>No models found</span>`}
            </div>
          ` : groups.map(group => html`
            <div class="cv-model-popover__group">
              <div class="cv-model-popover__group-name">${group.label}</div>
              ${group.items.map(m => {
                const key = `${m.provider}/${m.id}`
                const isSelected = key === this.selectedModel
                return html`
                  <button
                    class="cv-model-popover__item ${isSelected ? 'cv-model-popover__item--selected' : ''}"
                    @click=${() => { this.selectedModel = key; this.modelPopoverOpen = false }}
                  >
                    <span class="cv-model-popover__item-name">${this._modelDisplayName(m)}</span>
                    ${isSelected ? svgIcon('check', 14) : nothing}
                  </button>
                `
              })}
            </div>
          `)}
        </div>
      </div>
    `
  }

  private _navigateToSettings() {
    window.location.hash = '#/settings'
  }
}
