import type { Conversation } from './types'
import type { LlmProvider } from './llm/types'

const STORAGE_KEYS = {
  providers: 'ocbot_providers',
  defaultProviderId: 'ocbot_default_provider_id',
} as const

// --- Provider CRUD ---

export async function getProviders(): Promise<LlmProvider[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.providers)
  return (result[STORAGE_KEYS.providers] as LlmProvider[]) || []
}

export async function saveProvider(provider: LlmProvider): Promise<void> {
  const all = await getProviders()
  const idx = all.findIndex(p => p.id === provider.id)
  if (idx >= 0) {
    all[idx] = { ...provider, updatedAt: Date.now() }
  } else {
    all.push(provider)
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.providers]: all })
}

export async function deleteProvider(id: string): Promise<void> {
  const all = await getProviders()
  const filtered = all.filter(p => p.id !== id)
  await chrome.storage.local.set({ [STORAGE_KEYS.providers]: filtered })

  // If deleted provider was the default, clear it
  const defaultId = await getDefaultProviderId()
  if (defaultId === id) {
    const newDefault = filtered.length > 0 ? filtered[0].id : null
    await setDefaultProviderId(newDefault)
  }
}

// --- Default Provider ---

export async function getDefaultProviderId(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.defaultProviderId)
  return (result[STORAGE_KEYS.defaultProviderId] as string) || null
}

export async function setDefaultProviderId(id: string | null): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.defaultProviderId]: id ?? '' })
}

// --- Conversation persistence ---

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
