import type { LlmProvider, ProviderTemplate } from './types'

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
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
    type: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyPlaceholder: 'sk-ant-...',
    defaultModelId: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude 4.6 Opus', contextWindow: 200000 },
      { id: 'claude-sonnet-4-6', name: 'Claude 4.6 Sonnet', contextWindow: 200000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude 4.5 Haiku', contextWindow: 200000 },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude 4.5 Sonnet', contextWindow: 200000 },
      { id: 'claude-opus-4-5-20251101', name: 'Claude 4.5 Opus', contextWindow: 200000 },
    ],
  },
  {
    type: 'minimax',
    name: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    apiKeyPlaceholder: 'API key',
    defaultModelId: 'minimax-m2.5',
    models: [
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', contextWindow: 1000000 },
    ],
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.minimax.io/v1', apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key' },
      { id: 'cn', label: 'China', baseUrl: 'https://api.minimaxi.com/v1', apiKeyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key' },
    ],
  },
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
    type: 'xai',
    name: 'xAI',
    defaultBaseUrl: 'https://api.x.ai/v1',
    apiKeyUrl: 'https://console.x.ai/team/default/api-keys',
    apiKeyPlaceholder: 'xai-...',
    defaultModelId: 'grok-3',
    models: [
      { id: 'grok-3', name: 'Grok 3', contextWindow: 131072 },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', contextWindow: 131072 },
    ],
  },
  {
    type: 'glm',
    name: 'Z-AI (Zhipu)',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    apiKeyPlaceholder: 'API key',
    defaultModelId: 'glm-5',
    models: [
      { id: 'glm-5', name: 'GLM-5', contextWindow: 128000 },
    ],
    regions: [
      { id: 'global', label: 'Global', baseUrl: 'https://api.z.ai/api/paas/v4', apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
      { id: 'cn', label: 'China', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
    ],
  },
  {
    type: 'kimi',
    name: 'Kimi',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    apiKeyPlaceholder: 'sk-...',
    defaultModelId: 'kimi-k2.5',
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 262000 },
    ],
    regions: [
      { id: 'cn', label: 'China', baseUrl: 'https://api.moonshot.cn/v1', apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys' },
      { id: 'global', label: 'Global', baseUrl: 'https://api.moonshot.ai/v1', apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys' },
    ],
  },
  {
    type: 'arcee',
    name: 'Arcee',
    defaultBaseUrl: 'https://api.arcee.ai/v2',
    apiKeyUrl: 'https://app.arcee.ai/account/api-keys',
    apiKeyPlaceholder: 'API key',
    defaultModelId: 'arcee-blitz',
    models: [
      { id: 'arcee-blitz', name: 'Arcee Blitz', contextWindow: 131072 },
      { id: 'arcee-spark', name: 'Arcee Spark', contextWindow: 131072 },
    ],
  },
  {
    type: 'qwen',
    name: 'Qwen',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    apiKeyPlaceholder: 'sk-...',
    defaultModelId: 'qwen3-max',
    models: [
      { id: 'qwen3-max', name: 'Qwen3 Max', contextWindow: 262144 },
      { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus', contextWindow: 1000000 },
      { id: 'qwen3.5-flash', name: 'Qwen3.5 Flash', contextWindow: 1000000 },
      { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', contextWindow: 1000000 },
      { id: 'qwen3-coder-flash', name: 'Qwen3 Coder Flash', contextWindow: 1000000 },
    ],
    regions: [
      { id: 'cn', label: 'China', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
      { id: 'global', label: 'Global (Singapore)', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
    ],
  },
  {
    type: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiKeyPlaceholder: 'sk-or-...',
    defaultModelId: 'anthropic/claude-sonnet-4-6',
    models: [
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude 4.6 Sonnet', contextWindow: 200000 },
      { id: 'anthropic/claude-opus-4-6', name: 'Claude 4.6 Opus', contextWindow: 200000 },
      { id: 'openai/gpt-5.2', name: 'GPT-5.2', contextWindow: 400000 },
      { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro', contextWindow: 1000000 },
      { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', contextWindow: 128000 },
    ],
  },
  {
    type: 'local',
    name: 'Local',
    defaultBaseUrl: 'http://localhost:11434/v1',
    apiKeyPlaceholder: 'API key (optional)',
    defaultModelId: '',
    models: [],
  },
  {
    type: 'openai-compatible',
    name: 'Other',
    defaultBaseUrl: '',
    apiKeyPlaceholder: 'API key (optional)',
    defaultModelId: '',
    models: [],
  },
]

export function getTemplateByType(type: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find(t => t.type === type)
}

export function getModelDisplayName(provider: LlmProvider): string {
  const template = PROVIDER_TEMPLATES.find(t => t.type === provider.type)
  const model = template?.models.find(m => m.id === provider.modelId)
  const baseName = model?.name ?? provider.modelId ?? provider.name
  const isCn = template?.regions?.some(r => r.id === 'cn' && r.baseUrl === provider.baseUrl)
  return isCn ? `${baseName}-CN` : baseName
}

export function getRegionBaseUrl(template: ProviderTemplate, region: string): string {
  const r = template.regions?.find(r => r.id === region)
  return r?.baseUrl ?? template.defaultBaseUrl ?? ''
}

export function getRegionApiKeyUrl(template: ProviderTemplate, region: string): string | undefined {
  const r = template.regions?.find(r => r.id === region)
  return r?.apiKeyUrl ?? template.apiKeyUrl
}
