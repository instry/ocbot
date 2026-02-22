import { useState } from 'react'
import { ChatArea } from './components/ChatArea'
import { ChatInput } from './components/ChatInput'
import { Header } from './components/Header'
import { Settings } from './components/Settings'
import { useLlmProvider } from '../../lib/llm/useLlmProvider'
import { useChat } from './hooks/useChat'

type View = 'chat' | 'settings'

export function App() {
  const [view, setView] = useState<View>('chat')
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()
  const { messages, streamingText, isLoading, toolStatuses, error, sendMessage, stopAgent, clearChat } = useChat(selectedProvider)

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      {view === 'chat' ? (
        <>
          <Header
            selectedProvider={selectedProvider}
            providers={providers}
            onSelectProvider={selectProvider}
            onOpenSettings={() => setView('settings')}
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
        />
      )}
    </div>
  )
}
