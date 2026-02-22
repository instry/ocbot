import { useState } from 'react'
import { ChatArea } from './components/ChatArea'
import { ChatInput } from './components/ChatInput'
import { Header } from './components/Header'
import { Settings } from './components/Settings'
import { useLlmProvider } from '../../lib/llm/useLlmProvider'

type View = 'chat' | 'settings'

export function App() {
  const [view, setView] = useState<View>('chat')
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()

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
          <ChatArea hasProvider={!!selectedProvider} onOpenSettings={() => setView('settings')} />
          <ChatInput />
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
