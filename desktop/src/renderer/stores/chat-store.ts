import { create } from 'zustand'
import type { ChatMessage, ToolCard, Session, ContentPart, ChatEventPayload, AgentEventPayload } from '@/types/chat'

interface ChatStore {
  // Session management
  sessions: Session[]
  activeSessionKey: string

  // Messages (for active session)
  messages: ChatMessage[]
  isLoadingHistory: boolean

  // Streaming state
  streamText: string
  sending: boolean
  runId: string | null
  error: string | null
  canonicalSessionKey: string | null
  toolCards: Map<string, ToolCard>

  // Title tracking
  titleGenerated: boolean

  // Input history
  inputHistory: string[]
  historyIndex: number

  // Actions — sessions
  setSessions: (sessions: Session[]) => void
  setActiveSession: (key: string) => void
  addSession: (session: Session) => void
  removeSession: (key: string) => void
  updateSessionTitle: (key: string, title: string) => void

  // Actions — messages
  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  clearStreamState: () => void

  // Actions — chat events
  handleChatEvent: (payload: ChatEventPayload) => void
  handleAgentEvent: (payload: AgentEventPayload) => void

  // Actions — sending
  startSend: (text: string, runId: string) => void
  setError: (error: string | null) => void
  setSending: (sending: boolean) => void

  // Actions — tool cards
  toggleToolCard: (id: string) => void

  // Actions — input
  pushInputHistory: (input: string) => void
  resetHistoryIndex: () => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionKey: `ocbot:${Date.now()}`,
  messages: [],
  isLoadingHistory: false,
  streamText: '',
  sending: false,
  runId: null,
  error: null,
  canonicalSessionKey: null,
  toolCards: new Map(),
  titleGenerated: false,
  inputHistory: [],
  historyIndex: -1,

  // --- Session actions ---

  setSessions: (sessions) => set({ sessions: Array.isArray(sessions) ? sessions : [] }),

  setActiveSession: (key) => set({
    activeSessionKey: key,
    messages: [],
    streamText: '',
    error: null,
    toolCards: new Map(),
    canonicalSessionKey: null,
    titleGenerated: false,
    isLoadingHistory: true,
  }),

  addSession: (session) =>
    set(s => ({ sessions: [session, ...s.sessions] })),

  removeSession: (key) =>
    set(s => ({
      sessions: s.sessions.filter(sess => sess.key !== key),
    })),

  updateSessionTitle: (key, title) =>
    set(s => ({
      sessions: s.sessions.map(sess =>
        sess.key === key ? { ...sess, label: title } : sess
      ),
    })),

  // --- Message actions ---

  setMessages: (messages) => set({ messages: Array.isArray(messages) ? messages : [], isLoadingHistory: false }),

  addMessage: (message) =>
    set(s => ({ messages: [...s.messages, message] })),

  clearStreamState: () => set({
    streamText: '',
    runId: null,
    sending: false,
    toolCards: new Map(),
  }),

  // --- Chat event handling ---

  handleChatEvent: (payload) => {
    const { runId: currentRunId } = get()
    if (currentRunId && payload.runId && payload.runId !== currentRunId) return

    if (payload.sessionKey && !get().canonicalSessionKey) {
      set({ canonicalSessionKey: payload.sessionKey })
    }

    switch (payload.state) {
      case 'delta': {
        const text = payload.message?.content
          ?.filter(p => p.type === 'text')
          .map(p => p.text ?? '')
          .join('') ?? ''
        set({ streamText: text })
        break
      }
      case 'final': {
        if (payload.message) {
          const text = payload.message.content
            ?.filter(p => p.type === 'text')
            .map(p => p.text ?? '')
            .join('') ?? ''
          if (text.trim() && text.trim() !== 'NO_REPLY') {
            set(s => ({
              messages: [...s.messages, {
                id: crypto.randomUUID(),
                role: 'assistant' as const,
                content: payload.message!.content,
                timestamp: payload.message!.timestamp ?? Date.now(),
              }],
            }))
          }
        }
        set({
          streamText: '',
          runId: null,
          sending: false,
          toolCards: new Map(),
        })
        break
      }
      case 'aborted': {
        const { streamText } = get()
        if (streamText.trim()) {
          set(s => ({
            messages: [...s.messages, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: [{ type: 'text', text: streamText }] as ContentPart[],
              timestamp: Date.now(),
            }],
          }))
        }
        set({
          streamText: '',
          runId: null,
          sending: false,
          toolCards: new Map(),
        })
        break
      }
      case 'error': {
        set({
          error: payload.errorMessage ?? 'An error occurred',
          streamText: '',
          runId: null,
          sending: false,
          toolCards: new Map(),
        })
        break
      }
    }
  },

  handleAgentEvent: (payload) => {
    const { runId: currentRunId } = get()
    if (currentRunId && payload.runId && payload.runId !== currentRunId) return
    if (payload.stream !== 'tool' || !payload.data) return

    const data = payload.data
    const toolCallId = (data.toolCallId ?? data.id ?? '') as string
    if (!toolCallId) return

    const existing = get().toolCards.get(toolCallId)
    const updated = new Map(get().toolCards)
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
    set({ toolCards: updated })
  },

  // --- Send actions ---

  startSend: (text, runId) => {
    set(s => ({
      messages: [...s.messages, {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: [{ type: 'text', text }] as ContentPart[],
        timestamp: Date.now(),
      }],
      sending: true,
      streamText: '',
      toolCards: new Map(),
      error: null,
      runId,
    }))

    // Save to input history
    const { inputHistory } = get()
    if (inputHistory[inputHistory.length - 1] !== text) {
      set({ inputHistory: [...inputHistory, text] })
    }
    set({ historyIndex: -1 })
  },

  setError: (error) => set({ error }),
  setSending: (sending) => set({ sending }),

  // --- Tool card actions ---

  toggleToolCard: (id) => {
    const card = get().toolCards.get(id)
    if (!card) return
    const updated = new Map(get().toolCards)
    updated.set(id, { ...card, expanded: !card.expanded })
    set({ toolCards: updated })
  },

  // --- Input actions ---

  pushInputHistory: (input) => {
    const { inputHistory } = get()
    if (inputHistory[inputHistory.length - 1] !== input) {
      set({ inputHistory: [...inputHistory, input] })
    }
    set({ historyIndex: -1 })
  },

  resetHistoryIndex: () => set({ historyIndex: -1 }),
}))
