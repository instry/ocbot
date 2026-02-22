export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ToolResult {
  toolCallId: string
  name: string
  result: string
  isError?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  createdAt: number
  toolCalls?: ToolCall[]
  toolResult?: ToolResult
}

export interface Conversation {
  id: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}
