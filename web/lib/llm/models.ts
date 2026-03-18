import type { LlmProvider, ProviderTemplate } from './types'
import bundledModels from '../../models.json'

const LOCAL_ONLY_TEMPLATES: ProviderTemplate[] = [
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

let _remoteTemplates: ProviderTemplate[] | null = null

export function getProviderTemplates(): ProviderTemplate[] {
  const cloud = _remoteTemplates ?? (bundledModels as ProviderTemplate[])
  return [...cloud, ...LOCAL_ONLY_TEMPLATES]
}

export async function refreshModels(): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch('https://cdn.oc.bot/config/models.json', {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (resp.ok) {
      _remoteTemplates = (await resp.json()) as ProviderTemplate[]
    }
  } catch {
    // silently fall back to bundled models
  }
}

export function getTemplateByType(type: string): ProviderTemplate | undefined {
  return getProviderTemplates().find(t => t.type === type)
}

export function getModelDisplayName(provider: LlmProvider): string {
  const templates = getProviderTemplates()
  const template = templates.find(t => t.type === provider.type)
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
