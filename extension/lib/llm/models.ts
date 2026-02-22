import type { ProviderTemplate } from './types'

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    type: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyPlaceholder: 'sk-...',
    defaultModelId: 'gpt-5.2',
    models: [
      { id: 'gpt-5.2', name: 'GPT-5.2', contextWindow: 400000 },
      { id: 'gpt-5.1', name: 'GPT-5.1', contextWindow: 400000 },
      { id: 'gpt-5-thinking', name: 'GPT-5 Thinking', contextWindow: 400000 },
      { id: 'o3-mini', name: 'o3-mini', contextWindow: 200000 },
    ],
  },
  {
    type: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-...',
    defaultModelId: 'claude-sonnet-4-5-20250929',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude 4.5 Sonnet', contextWindow: 200000 },
      { id: 'claude-opus-4-5-20251101', name: 'Claude 4.5 Opus', contextWindow: 200000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude 4.5 Haiku', contextWindow: 200000 },
    ],
  },
  {
    type: 'google',
    name: 'Google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    apiKeyPlaceholder: 'AI...',
    defaultModelId: 'gemini-3.1-pro',
    models: [
      { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', contextWindow: 1000000 },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', contextWindow: 1000000 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576 },
    ],
  },
  {
    type: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    apiKeyPlaceholder: 'sk-...',
    defaultModelId: 'deepseek-v3.2',
    models: [
      { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', contextWindow: 128000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextWindow: 128000 },
    ],
  },
  {
    type: 'qwen',
    name: 'Qwen',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    apiKeyPlaceholder: 'sk-...',
    defaultModelId: 'qwen-max',
    models: [
      { id: 'qwen-max', name: 'Qwen Max (Latest)', contextWindow: 32000 },
      { id: 'qwen-plus', name: 'Qwen Plus', contextWindow: 131072 },
      { id: 'qwen3-coder', name: 'Qwen3 Coder', contextWindow: 131072 },
    ],
  },
  {
    type: 'kimi',
    name: 'Kimi',
    // Global: https://api.moonshot.ai/v1 (User preferred domain: kimi.com), CN: https://api.moonshot.cn/v1
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    apiKeyPlaceholder: 'sk-...',
    defaultModelId: 'kimi-k2.5',
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 262000 },
    ],
  },
  {
    type: 'glm',
    name: 'GLM',
    // Global: https://api.z.ai/api/paas/v4, CN: https://open.bigmodel.cn/api/paas/v4
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    apiKeyPlaceholder: 'API key',
    defaultModelId: 'glm-5',
    models: [
      { id: 'glm-5', name: 'GLM-5', contextWindow: 128000 },
    ],
  },
  {
    type: 'minimax',
    name: 'MiniMax',
    // Global: https://api.minimax.io/v1, CN: https://api.minimaxi.com/v1
    defaultBaseUrl: 'https://api.minimax.io/v1',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    apiKeyPlaceholder: 'API key',
    defaultModelId: 'minimax-m2.5',
    models: [
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', contextWindow: 1000000 },
    ],
  },
  {
    type: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiKeyPlaceholder: 'sk-or-...',
    defaultModelId: 'anthropic/claude-sonnet-4-5',
    models: [
      { id: 'anthropic/claude-sonnet-4-5', name: 'Claude 4.5 Sonnet', contextWindow: 200000 },
      { id: 'openai/gpt-5.2', name: 'GPT-5.2', contextWindow: 400000 },
      { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro', contextWindow: 1000000 },
      { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', contextWindow: 128000 },
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
