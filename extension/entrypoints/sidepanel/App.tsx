import { useState, useEffect, useCallback } from 'react'
import { ChatArea } from './components/ChatArea'
import { ChatInput } from './components/ChatInput'
import { Header } from './components/Header'
import { Settings } from './components/Settings'
import { useLlmProvider } from '../../lib/llm/useLlmProvider'
import { useChat } from './hooks/useChat'
import type { ChannelStatus } from '../../lib/channels/types'

type View = 'chat' | 'settings'

export function App() {
  const [view, setView] = useState<View>('chat')
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()
  const { messages, streamingText, isLoading, toolStatuses, error, sendMessage, stopAgent, newChat } = useChat(selectedProvider)
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelStatus>>({})

  const refreshChannelStatuses = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'getChannelStatuses' }, (resp) => {
      if (resp?.ok) {
        setChannelStatuses(resp.statuses)
      }
    })
  }, [])

  // Poll statuses on mount and listen for updates
  useEffect(() => {
    refreshChannelStatuses()
    const interval = setInterval(refreshChannelStatuses, 5000)

    const listener = (message: { type: string; channelId: string; status: ChannelStatus }) => {
      if (message.type === 'channelStatusUpdate') {
        setChannelStatuses(prev => ({ ...prev, [message.channelId]: message.status }))
      }
    }
    chrome.runtime.onMessage.addListener(listener)

    return () => {
      clearInterval(interval)
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [refreshChannelStatuses])

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      {view === 'chat' ? (
        <>
          <Header
            selectedProvider={selectedProvider}
            providers={providers}
            onSelectProvider={selectProvider}
            onOpenSettings={() => setView('settings')}
            onNewChat={newChat}
            channelStatuses={channelStatuses}
          />
          <ChatArea
            hasProvider={!!selectedProvider}
            onOpenSettings={() => setView('settings')}
            messages={messages}
            streamingText={streamingText}
            isLoading={isLoading}
            toolStatuses={toolStatuses}
            error={error}
          />
          <ChatInput
            onSend={sendMessage}
            onStop={stopAgent}
            isLoading={isLoading}
            disabled={!selectedProvider}
          />
        </>
      ) : (
        <Settings
          providers={providers}
          selectedProvider={selectedProvider}
          onSaveProvider={saveProvider}
          onDeleteProvider={deleteProvider}
          onSelectProvider={selectProvider}
          onBack={() => setView('chat')}
          channelStatuses={channelStatuses}
          onRefreshChannelStatuses={refreshChannelStatuses}
        />
      )}
    </div>
  )
}
