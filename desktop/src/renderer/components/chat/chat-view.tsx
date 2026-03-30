import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { MessageList } from './message-list'
import { ChatInput } from './chat-input'
import { ModelPicker } from './model-picker'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { useChatStore } from '@/stores/chat-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { useSetupStore } from '@/stores/setup-store'
import { useUIStore } from '@/stores/ui-store'
import { messageText } from '@/types/chat'
import type { ChatEventPayload, AgentEventPayload } from '@/types/chat'

export function ChatView() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const client = useGatewayStore(s => s.client)
  const status = useGatewayStore(s => s.status)
  const activeSessionKey = useChatStore(s => s.activeSessionKey)
  const sending = useChatStore(s => s.sending)
  const error = useChatStore(s => s.error)
  const setupStatus = useSetupStore(s => s.status)
  const setTab = useUIStore(s => s.setTab)

  // Load history when session changes
  useEffect(() => {
    if (!client || status !== 'connected') return

    const loadHistory = async () => {
      try {
        const result = await client.call<{
          messages?: Array<{ role: string; content: unknown; timestamp?: number }>
        }>('chat.history', { sessionKey: activeSessionKey, limit: 200 })

        if (result?.messages) {
          const messages = result.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .filter(m => {
              const text = typeof m.content === 'string'
                ? m.content
                : Array.isArray(m.content)
                  ? (m.content as Array<{ type: string; text?: string }>)
                      .map(p => p.text ?? '').join('')
                  : ''
              return m.role !== 'assistant' || text.trim() !== 'NO_REPLY'
            })
            .map(m => ({
              id: crypto.randomUUID(),
              role: m.role as 'user' | 'assistant',
              content: m.content as any,
              timestamp: m.timestamp ?? Date.now(),
            }))

          const store = useChatStore.getState()
          store.setMessages(messages)
          // Mark title as already generated for existing sessions
          if (messages.length > 0) {
            useChatStore.setState({ titleGenerated: true })
          }
        }
      } catch {
        // New session, no history
        useChatStore.getState().setMessages([])
      }
    }
    loadHistory()
  }, [client, status, activeSessionKey])

  // Subscribe to gateway events
  useEffect(() => {
    if (!client || status !== 'connected') return

    const unsub = client.onEvent((event, payload) => {
      if (event === 'chat') {
        useChatStore.getState().handleChatEvent(payload as ChatEventPayload)

        // Auto-generate title after first exchange
        if ((payload as ChatEventPayload).state === 'final') {
          maybeGenerateTitle()
        }
      }
      if (event === 'agent') {
        useChatStore.getState().handleAgentEvent(payload as AgentEventPayload)
      }
    })

    return unsub
  }, [client, status])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top bar with model picker */}
      <div className="no-drag flex items-center justify-between border-b border-border px-4 py-2">
        <ModelPicker />
        {sending && (
          <span className="text-xs text-muted-foreground animate-pulse-subtle">
            {t('Generating...')}
          </span>
        )}
      </div>

      {/* Messages */}
      <MessageList />

      {/* Error display */}
      {error && (
        <div className="mx-auto max-w-3xl px-6 pb-2">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-danger-subtle px-4 py-3 text-[13px] text-destructive">
            <span>{error}</span>
            {setupStatus === 'needs_onboarding' || error.includes('Open Models') ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTab('models')
                  navigate('/models?onboard=1')
                }}
              >
                {t('Open Models')}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {/* Input area */}
      <ChatInput />
    </div>
  )
}

/** Auto-generate session title after first user+assistant exchange */
async function maybeGenerateTitle() {
  const store = useChatStore.getState()
  if (store.titleGenerated) return

  const userMsgs = store.messages.filter(m => m.role === 'user')
  const assistantMsgs = store.messages.filter(m => m.role === 'assistant')
  if (userMsgs.length !== 1 || assistantMsgs.length !== 1) return

  useChatStore.setState({ titleGenerated: true })

  const userText = messageText(userMsgs[0]).trim()
  if (!userText) return

  const title = userText.length > 30
    ? userText.slice(0, 29) + '…'
    : userText

  const client = useGatewayStore.getState().client
  if (!client) return

  try {
    await client.call('sessions.patch', {
      key: store.activeSessionKey,
      label: title,
    })
    store.updateSessionTitle(store.activeSessionKey, title)
  } catch { /* best effort */ }
}
