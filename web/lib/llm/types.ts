// --- Tool definitions for function calling ---

export interface ToolParameter {
  type: string
  description?: string
  enum?: string[]
  items?: {
    type: string
    properties?: Record<string, ToolParameter>
    required?: string[]
  }
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameter>
    required?: string[]
  }
}

// --- Multimodal content parts ---

export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image'
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  data: string // base64
}

export type ContentPart = TextPart | ImagePart

// --- LLM request/response message types ---

export interface ToolCallPart {
  id: string
  name: string
  arguments: string
}

export interface LlmRequestMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | ContentPart[]
  toolCalls?: ToolCallPart[]
  toolCallId?: string
  reasoningContent?: string
}

// --- Unified SSE stream events ---

export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; arguments: string }
  | { type: 'done' }
  | { type: 'error'; error: string }
