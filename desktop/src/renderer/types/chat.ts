export interface ContentPart {
  type: string
  text?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: ContentPart[] | string
  timestamp: number
  isStreaming?: boolean
}

export interface ToolCard {
  id: string
  name: string
  phase: 'running' | 'done' | 'error'
  output?: string
  args?: string
  startedAt: number
  expanded: boolean
}

export interface Session {
  key: string
  label?: string
  displayName?: string
  derivedTitle?: string
  lastMessage?: string
  createdAt?: number
  updatedAt?: number
}

export interface ChatEventPayload {
  runId?: string
  sessionKey?: string
  state?: 'delta' | 'final' | 'error' | 'aborted'
  message?: { role: string; content: ContentPart[]; timestamp?: number }
  errorMessage?: string
}

export interface AgentEventPayload {
  runId?: string
  stream?: string
  sessionKey?: string
  data?: Record<string, unknown>
}

export interface GatewayModel {
  id: string
  name: string
  provider: string
}

// Helper to extract text from a ChatMessage
export function messageText(msg: ChatMessage): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p): p is ContentPart & { text: string } => p.type === 'text' && !!p.text)
      .map(p => p.text)
      .join('')
  }
  return ''
}

export function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
