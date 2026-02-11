import { type FormEvent, useCallback, useRef, useState } from 'react'
import { streamChat } from '@/lib/llm/openai'
import { sendMessage, type PageContent } from '@/lib/messaging'
import { getApiKey, getModel, saveConversation } from '@/lib/storage'
import type { ChatMessage } from '@/lib/types'
import { ChatEmptyState } from './components/ChatEmptyState'
import { ChatHeader } from './components/ChatHeader'
import { ChatInput } from './components/ChatInput'
import { ChatMessages } from './components/ChatMessages'
import { PageContext } from './components/PageContext'
import { SettingsPage } from './components/SettingsPage'

export const App = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [pageContent, setPageContent] = useState<PageContent | null>(null)
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID())

  const isStreaming = streamingContent !== null

  const fetchPageContent = async (): Promise<PageContent | null> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url?.startsWith('http')) return null
      const content = await sendMessage('getPageContent', undefined, tab.id)
      setPageContent(content)
      return content
    } catch {
      return null
    }
  }

  const handleNewConversation = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setStreamingContent(null)
    setInput('')
    setConversationId(crypto.randomUUID())
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

    const page = await fetchPageContent()
    const model = await getModel()

    const systemContent = page
      ? `You are ocbot, a helpful AI browser assistant. The user is currently viewing:\n\nURL: ${page.url}\nTitle: ${page.title}\n\nPage content (truncated):\n${page.text}`
      : 'You are ocbot, a helpful AI browser assistant.'

    const apiMessages = [
      { role: 'system', content: systemContent },
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
        setMessages((prev) => {
          const updated = [...prev, assistantMsg]
          saveConversation({
            id: conversationId,
            messages: updated,
            createdAt: updated[0]?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
          })
          return updated
        })
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

  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <ChatHeader
        onNewConversation={handleNewConversation}
        onOpenSettings={() => setShowSettings(true)}
      />
      <PageContext page={pageContent} />
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
