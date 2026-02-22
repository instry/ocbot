import { useState, useCallback, useRef } from 'react'
import type { ChatMessage } from '@/lib/types'
import type { LlmProvider, LlmRequestMessage } from '@/lib/llm/types'
import { runAgentLoop } from '@/lib/agent/loop'

export interface ToolStatus {
  id: string
  name: string
  status: 'running' | 'done'
  result?: string
}

export function useChat(provider: LlmProvider | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    if (!provider || !text.trim() || isLoading) return

    setError(null)
    setIsLoading(true)
    setStreamingText('')
    setToolStatuses([])

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text.trim(),
      createdAt: Date.now(),
    }

    setMessages(prev => [...prev, userMsg])

    // Build LLM messages from chat history
    const allMessages = [...messages, userMsg]
    const llmMessages: LlmRequestMessage[] = allMessages.map(m => {
      if (m.role === 'tool' && m.toolResult) {
        return {
          role: 'tool' as const,
          content: m.toolResult.result,
          toolCallId: m.toolResult.toolCallId,
        }
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: m.content || undefined,
          toolCalls: m.toolCalls,
        }
      }
      return {
        role: m.role === 'tool' ? 'tool' as const : m.role as 'user' | 'assistant',
        content: m.content,
      }
    })

    const abortController = new AbortController()
    abortRef.current = abortController

    let currentText = ''

    try {
      await runAgentLoop(
        provider,
        llmMessages,
        {
          onTextDelta: (text) => {
            currentText += text
            setStreamingText(currentText)
          },
          onToolCallStart: (id, name) => {
            setToolStatuses(prev => [...prev, { id, name, status: 'running' }])
          },
          onToolCallEnd: (id, name, result) => {
            setToolStatuses(prev =>
              prev.map(ts => ts.id === id ? { ...ts, status: 'done' as const, result } : ts)
            )
          },
          onAssistantMessage: (content, toolCalls) => {
            if (content || toolCalls.length > 0) {
              const assistantMsg: ChatMessage = {
                id: `msg_${Date.now()}_assistant`,
                role: 'assistant',
                content: content || '',
                createdAt: Date.now(),
                toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                })) : undefined,
              }
              setMessages(prev => [...prev, assistantMsg])
              currentText = ''
              setStreamingText('')
            }
          },
          onToolMessage: (toolCallId, name, result) => {
            const toolMsg: ChatMessage = {
              id: `msg_${Date.now()}_tool_${toolCallId}`,
              role: 'tool',
              content: result.slice(0, 500),
              createdAt: Date.now(),
              toolResult: { toolCallId, name, result: result.slice(0, 500) },
            }
            setMessages(prev => [...prev, toolMsg])
          },
          onError: (error) => {
            setError(error)
          },
        },
        abortController.signal,
      )
    } catch (err: unknown) {
      if (abortController.signal.aborted) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
      setStreamingText('')
      abortRef.current = null
    }
  }, [provider, messages, isLoading])

  const stopAgent = useCallback(() => {
    abortRef.current?.abort()
    setIsLoading(false)
    setStreamingText('')
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    setStreamingText('')
    setToolStatuses([])
    setError(null)
  }, [])

  return {
    messages,
    streamingText,
    isLoading,
    toolStatuses,
    error,
    sendMessage,
    stopAgent,
    clearChat,
  }
}
