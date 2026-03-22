import { ChatArea } from '@/components/ChatArea'
import { ChatInput } from '@/components/ChatInput'
import { ChatList } from '@/components/ChatList'
import { useChat } from '@/lib/hooks/useChat'
import { useGatewayModels } from '@/lib/hooks/useGatewayModels'
import { useI18n } from '@/lib/i18n/context'
import { useState } from 'react'
import { PanelLeft, SquarePen } from 'lucide-react'

export function ChatPage() {
  const { gatewayUrl, models, selectedModel, selectModel } = useGatewayModels()
  const {
    messages, conversationId, conversations, streamingText, isLoading,
    toolStatuses, error, sendMessage, stopAgent, newChat,
    loadConversation, removeConversation,
  } = useChat(gatewayUrl, selectedModel)
  const [showChatList, setShowChatList] = useState(false)
  const { t } = useI18n()

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
          title={t('chat.chatList')}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="flex-1" />
        <button
          onClick={newChat}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          title={t('chat.newChat')}
        >
          <SquarePen className="h-4 w-4" />
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-4">
          <h1 className="mb-8 text-2xl font-semibold text-foreground">{t('chat.welcomeLg')}</h1>
          <ChatInput
            variant="centered"
            onSend={sendMessage}
            onStop={stopAgent}
            isLoading={isLoading}
            disabled={!selectedModel}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={selectModel}
          />
        </div>
      ) : (
        <>
          <ChatArea
            hasProvider={!!selectedModel}
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
            disabled={!selectedModel}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={selectModel}
          />
        </>
      )}
    </div>
  )
}
