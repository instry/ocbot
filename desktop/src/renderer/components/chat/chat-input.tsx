import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { useGatewayStore } from '@/stores/gateway-store'
import { cn } from '@/lib/utils'

export function ChatInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)

  const sending = useChatStore(s => s.sending)
  const activeSessionKey = useChatStore(s => s.activeSessionKey)
  const startSend = useChatStore(s => s.startSend)
  const setError = useChatStore(s => s.setError)
  const setSending = useChatStore(s => s.setSending)
  const inputHistory = useChatStore(s => s.inputHistory)
  const client = useGatewayStore(s => s.client)

  const historyIndexRef = useRef(-1)

  const handleSend = useCallback(async () => {
    const text = input.trim()
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
  }, [input, sending, client, activeSessionKey, startSend, setError, setSending])

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
        <div className="relative flex min-h-[80px] flex-col rounded-2xl border border-border bg-bg-muted transition-colors focus-within:border-accent">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            placeholder="Send a message..."
            disabled={sending}
            rows={3}
            maxLength={20000}
            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
            className={cn(
              'flex-1 resize-none bg-transparent px-4 py-3 pr-12 text-[14px] text-text',
              'placeholder:text-muted-foreground',
              'max-h-[200px] min-h-[80px]',
            )}
          />
          <button
            onClick={sending ? handleAbort : handleSend}
            disabled={!input.trim() && !sending}
            className={cn(
              'absolute bottom-2 right-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all',
              'shadow-sm',
              sending
                ? 'bg-black/8 text-gray-600 hover:bg-black/15 dark:bg-white/8 dark:text-gray-400 dark:hover:bg-white/15'
                : 'bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-30 disabled:cursor-default',
            )}
          >
            {sending ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
