export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface Conversation {
  id: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}