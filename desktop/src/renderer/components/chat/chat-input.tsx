import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n'
import { useChatStore } from '@/stores/chat-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { useSetupStore } from '@/stores/setup-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

export function ChatInput() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)

  const sending = useChatStore(s => s.sending)
  const activeSessionKey = useChatStore(s => s.activeSessionKey)
  const startSend = useChatStore(s => s.startSend)
  const setError = useChatStore(s => s.setError)
  const setSending = useChatStore(s => s.setSending)
  const client = useGatewayStore(s => s.client)
  const setupStatus = useSetupStore(s => s.status)
  const setTab = useUIStore(s => s.setTab)

  const historyIndexRef = useRef(-1)

  const openSetup = useCallback(() => {
    setError(t('No AI provider is configured yet. Open Models and add your first provider to finish setup.'))
    setTab('models')
    navigate('/models?onboard=1')
  }, [navigate, setError, setTab, t])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (setupStatus === 'needs_onboarding') {
      openSetup()
      return
    }

    if (!text || sending || !client) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    const idempotencyKey = crypto.randomUUID()
    startSend(text, idempotencyKey)

    try {
      await client.call('chat.send', {
        sessionKey: activeSessionKey,
        message: text,
        idempotencyKey,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSending(false)
    }
  }, [input, sending, client, activeSessionKey, startSend, setError, setSending, setupStatus, openSetup])

  const handleAbort = useCallback(async () => {
    if (!client) return
    const { activeSessionKey: key, runId } = useChatStore.getState()
    try {
      await client.call('chat.abort', { sessionKey: key, runId })
    } catch {
      // best effort
    }
  }, [client])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
      return
    }

    // Input history navigation
    if (e.key === 'ArrowUp' && input === '') {
      e.preventDefault()
      const history = useChatStore.getState().inputHistory
      if (history.length > 0) {
        if (historyIndexRef.current === -1) {
          historyIndexRef.current = history.length - 1
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--
        }
        setInput(history[historyIndexRef.current])
      }
      return
    }
    if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
      e.preventDefault()
      const history = useChatStore.getState().inputHistory
      if (historyIndexRef.current < history.length - 1) {
        historyIndexRef.current++
        setInput(history[historyIndexRef.current])
      } else {
        historyIndexRef.current = -1
        setInput('')
      }
    }
  }, [input, handleSend])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    historyIndexRef.current = -1
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  return (
    <div className="px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex min-h-[80px] flex-col rounded-[1.25rem] border border-border bg-card/90 p-1 shadow-sm transition-colors focus-within:border-accent">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            placeholder={setupStatus === 'needs_onboarding'
              ? t('Add a provider in Models to start chatting...')
              : t('Send a message...')}
            disabled={sending}
            rows={3}
            maxLength={20000}
            className={cn(
              'max-h-[200px] min-h-[80px] resize-none border-none bg-transparent px-4 py-3 pr-12 text-[14px] shadow-none ring-0 focus-visible:ring-0',
            )}
          />
          <Button
            onClick={sending ? handleAbort : (setupStatus === 'needs_onboarding' ? openSetup : handleSend)}
            disabled={setupStatus === 'needs_onboarding' ? false : (!input.trim() && !sending)}
            variant={sending ? 'secondary' : 'primary'}
            size="icon"
            className={cn(
              'absolute bottom-3 right-3 h-9 w-9 rounded-full',
              sending && 'border-border bg-bg text-muted-foreground',
              !sending && 'disabled:cursor-default',
            )}
          >
            {sending ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
