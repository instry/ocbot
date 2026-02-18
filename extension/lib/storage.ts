import type { Conversation } from './types'

const STORAGE_KEYS = {
  apiKeys: 'ocbot_api_keys',
  currentProvider: 'ocbot_current_provider',
  currentModel: 'ocbot_current_model',
} as const

// API Keys storage (per provider)
export async function getApiKey(provider: string): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.apiKeys)
  const keys = result[STORAGE_KEYS.apiKeys] as Record<string, string> || {}
  return keys[provider] || null
}

export async function setApiKey(provider: string, key: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.apiKeys)
  const keys = result[STORAGE_KEYS.apiKeys] as Record<string, string> || {}
  keys[provider] = key
  await chrome.storage.local.set({ [STORAGE_KEYS.apiKeys]: keys })
}

export async function getAllApiKeys(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.apiKeys)
  return result[STORAGE_KEYS.apiKeys] as Record<string, string> || {}
}

// Current provider/model
export async function getCurrentProvider(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.currentProvider)
  return (result[STORAGE_KEYS.currentProvider] as string) || 'openai'
}

export async function setCurrentProvider(provider: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.currentProvider]: provider })
}

export async function getCurrentModel(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.currentModel)
  return (result[STORAGE_KEYS.currentModel] as string) || 'gpt-4o-mini'
}

export async function setCurrentModel(model: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.currentModel]: model })
}

// Conversation persistence
const CONVERSATIONS_KEY = 'ocbot_conversations'

export async function getConversations(): Promise<Conversation[]> {
  const result = await chrome.storage.local.get(CONVERSATIONS_KEY)
  return (result[CONVERSATIONS_KEY] as Conversation[]) || []
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const all = await getConversations()
  const idx = all.findIndex(c => c.id === conv.id)
  if (idx >= 0) {
    all[idx] = conv
  } else {
    all.unshift(conv)
  }
  // Keep last 50 conversations
  await chrome.storage.local.set({ [CONVERSATIONS_KEY]: all.slice(0, 50) })
}

export async function deleteConversation(id: string): Promise<void> {
  const all = await getConversations()
  const filtered = all.filter(c => c.id !== id)
  await chrome.storage.local.set({ [CONVERSATIONS_KEY]: filtered })
}