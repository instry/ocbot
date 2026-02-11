const STORAGE_KEYS = {
  apiKey: 'ocbot_api_key',
  model: 'ocbot_model',
} as const

export async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.apiKey)
  return (result[STORAGE_KEYS.apiKey] as string) ?? null
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: key })
}

export async function getModel(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.model)
  return (result[STORAGE_KEYS.model] as string) ?? 'gpt-4o-mini'
}

export async function setModel(model: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.model]: model })
}
