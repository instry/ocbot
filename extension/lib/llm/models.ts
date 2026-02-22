import type { ProviderTemplate } from './types'

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    type: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyPlaceholder: 'sk-...',
    defaultModelId: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'o1', name: 'o1', contextWindow: 200000 },
      { id: 'o3-mini', name: 'o3-mini', contextWindow: 200000 },
    ],
  },
  {
    type: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-...',
    defaultModelId: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude 4 Sonnet', contextWindow: 200000 },
      { id: 'claude-opus-4-20250514', name: 'Claude 4 Opus', contextWindow: 200000 },
    ],
  },
  {
    type: 'google',
    name: 'Google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeyPlaceholder: 'AI...',
    defaultModelId: 'gemini-2.0-flash',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576 },
    ],
  },
  {
    type: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiKeyPlaceholder: 'sk-or-...',
    defaultModelId: 'anthropic/claude-sonnet-4',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude 4 Sonnet', contextWindow: 200000 },
      { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
      { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', contextWindow: 1048576 },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', contextWindow: 131072 },
    ],
  },
  {
    type: 'openai-compatible',
    name: 'OpenAI Compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    apiKeyPlaceholder: 'API key (optional)',
    defaultModelId: '',
    models: [],
  },
]

export function getTemplateByType(type: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find(t => t.type === type)
}
