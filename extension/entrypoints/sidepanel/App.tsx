import { type FormEvent, useCallback, useState } from 'react'
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

  const isStreaming = streamingContent !== null

  const handleNewConversation = useCallback(() => {
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

  const handleSend = (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    // LLM call will be implemented in Task 4
    setStreamingContent('')
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'LLM integration coming in next task!',
        createdAt: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingContent(null)
    }, 500)
  }

  const handleStop = () => {
    setStreamingContent(null)
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
