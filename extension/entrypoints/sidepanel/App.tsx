import { type FormEvent, useCallback, useRef, useState } from 'react'
import { streamChat } from '@/lib/llm/openai'
import { getApiKey, getModel } from '@/lib/storage'
import type { ChatMessage } from '@/lib/types'
import { ChatEmptyState } from './components/ChatEmptyState'
import { ChatHeader } from './components/ChatHeader'
import { ChatInput } from './components/ChatInput'
import { ChatMessages } from './components/ChatMessages'

export const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const isStreaming = streamingContent !== null

  const handleNewConversation = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setStreamingContent(null)
    setInput('')
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    handleSend(text)
  }

  const handleSend = async (text: string) => {
    const apiKey = await getApiKey()
    if (!apiKey) {
      setShowSettings(true)
      return
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setStreamingContent('')

    const model = await getModel()
    const apiMessages = [
      { role: 'system', content: 'You are ocbot, a helpful AI browser assistant.' },
      ...[...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
    ]

    abortRef.current = streamChat(apiKey, model, apiMessages, {
      onToken: (token) => {
        setStreamingContent((prev) => (prev ?? '') + token)
      },
      onDone: (fullText) => {
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fullText,
          createdAt: Date.now(),
        }
        setMessages((prev) => [...prev, assistantMsg])
        setStreamingContent(null)
        abortRef.current = null
      },
      onError: (error) => {
        setStreamingContent(null)
        abortRef.current = null
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${error.message}`,
          createdAt: Date.now(),
        }
        setMessages((prev) => [...prev, errorMsg])
      },
    })
  }

  const handleStop = () => {
    abortRef.current?.abort()
    if (streamingContent) {
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: streamingContent,
        createdAt: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    }
    setStreamingContent(null)
    abortRef.current = null
  }

  const handleSuggestionClick = (prompt: string) => {
    handleSend(prompt)
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <ChatHeader
        onNewConversation={handleNewConversation}
        onOpenSettings={() => setShowSettings(true)}
      />
      {messages.length === 0 && !isStreaming ? (
        <main className="flex flex-1 flex-col overflow-hidden">
          <ChatEmptyState onSuggestionClick={handleSuggestionClick} />
        </main>
      ) : (
        <ChatMessages messages={messages} streamingContent={streamingContent} />
      )}
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        isStreaming={isStreaming}
        onStop={handleStop}
      />
    </div>
  )
}
