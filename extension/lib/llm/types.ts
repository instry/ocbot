export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'deepseek' | 'qwen' | 'kimi' | 'glm' | 'minimax' | 'openai-compatible'

export interface ModelInfo {
  id: string
  name: string
  contextWindow: number
}

export interface ProviderTemplate {
  type: ProviderType
  name: string
  defaultBaseUrl?: string
  models: ModelInfo[]
  defaultModelId: string
  apiKeyUrl?: string
  apiKeyPlaceholder?: string
}

export interface LlmProvider {
  id: string
  type: ProviderType
  name: string
  apiKey: string
  baseUrl?: string
  modelId: string
  createdAt: number
  updatedAt: number
}

// --- Tool definitions for function calling ---

export interface ToolParameter {
  type: string
  description?: string
  enum?: string[]
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

// --- LLM request/response message types ---

export interface ToolCallPart {
  id: string
  name: string
  arguments: string
}

export interface LlmRequestMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
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

// --- Provider adapter interface ---

export interface ProviderAdapter {
  buildRequest(
    provider: LlmProvider,
    messages: LlmRequestMessage[],
    tools?: ToolDefinition[],
  ): { url: string; headers: Record<string, string>; body: string }

  parseSSELine(
    line: string,
    eventType?: string,
  ): LlmStreamEvent[]
}

// --- Provider family mapping ---

export type ProviderFamily = 'openai' | 'anthropic' | 'google'

export function getProviderFamily(type: ProviderType): ProviderFamily {
  switch (type) {
    case 'anthropic':
      return 'anthropic'
    case 'google':
      return 'google'
    default:
      return 'openai'
  }
}
