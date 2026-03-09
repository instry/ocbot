import { ChatArea } from '@/components/ChatArea'
import { ChatInput } from '@/components/ChatInput'
import { ChatList } from '@/components/ChatList'
import { useChat } from '@/lib/hooks/useChat'
import { useLlmProvider } from '@/lib/llm/useLlmProvider'
import { useState } from 'react'
import { PanelLeft, SquarePen } from 'lucide-react'

export function ChatPage() {
  const { providers, selectedProvider, selectProvider } = useLlmProvider()
  const {
    messages, conversationId, conversations, streamingText, isLoading,
    toolStatuses, error, sendMessage, stopAgent, newChat,
    loadConversation, removeConversation,
  } = useChat(selectedProvider)
  const [showChatList, setShowChatList] = useState(false)

  if (showChatList) {
    return (
      <ChatList
        conversations={conversations}
        activeConversationId={conversationId}
        onSelectChat={(id) => { loadConversation(id); setShowChatList(false) }}
        onDeleteChat={removeConversation}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border/40 px-3 py-2">
        <button
          onClick={() => setShowChatList(true)}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="Chat list"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="flex-1" />
        <button
          onClick={newChat}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title="New chat"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>
      
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <h1 className="mb-8 text-2xl font-semibold text-foreground">What can I help you with?</h1>
          <ChatInput
            variant="centered"
            onSend={sendMessage}
            onStop={stopAgent}
            isLoading={isLoading}
            disabled={!selectedProvider}
          />
        </div>
      ) : (
        <>
          <ChatArea
            hasProvider={!!selectedProvider}
            onOpenSettings={() => {/* TODO: navigate to settings page */}}
            messages={messages}
            streamingText={streamingText}
            isLoading={isLoading}
            toolStatuses={toolStatuses}
            error={error}
          />
          <ChatInput
            variant="footer"
            onSend={sendMessage}
            onStop={stopAgent}
            isLoading={isLoading}
            disabled={!selectedProvider}
          />
        </>
      )}
    </div>
  )
}
