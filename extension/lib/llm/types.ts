export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible'

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
