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
    <div className="border-t border-border px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="flex min-h-[44px] flex-1 flex-col rounded-2xl border border-border bg-bg-muted transition-colors focus-within:border-accent">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true }}
            onCompositionEnd={() => { isComposingRef.current = false }}
            placeholder="Send a message..."
            disabled={sending}
            rows={1}
            maxLength={20000}
            className={cn(
              'flex-1 resize-none bg-transparent px-4 py-3 text-[14px] text-text',
              'placeholder:text-muted-foreground',
              'focus:outline-none',
              'max-h-[200px] min-h-[44px]',
            )}
          />
        </div>

        <button
          onClick={sending ? handleAbort : handleSend}
          disabled={!input.trim() && !sending}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
            sending
              ? 'bg-bg-muted text-muted-foreground hover:bg-bg-hover'
              : 'bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed',
          )}
        >
          {sending ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
