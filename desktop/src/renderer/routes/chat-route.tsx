import { useEffect } from 'react'
import { useParams } from 'react-router'
import { ChatView } from '@/components/chat/chat-view'
import { useChatStore } from '@/stores/chat-store'

export function ChatRoute() {
  const { sessionKey } = useParams()

  // Sync URL param to store
  useEffect(() => {
    if (sessionKey) {
      const decoded = decodeURIComponent(sessionKey)
      const current = useChatStore.getState().activeSessionKey
      if (decoded !== current) {
        useChatStore.getState().setActiveSession(decoded)
      }
    }
  }, [sessionKey])

  return <ChatView />
}
