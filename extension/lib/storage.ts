import type { ChatMessage } from '@/lib/types'

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

// --- Conversation persistence ---

interface Conversation {
  id: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

const CONVERSATIONS_KEY = 'ocbot_conversations'
const CURRENT_CONV_KEY = 'ocbot_current_conversation'

export async function getConversations(): Promise<Conversation[]> {
  const result = await chrome.storage.local.get(CONVERSATIONS_KEY)
  return (result[CONVERSATIONS_KEY] as Conversation[]) ?? []
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const all = await getConversations()
  const idx = all.findIndex((c) => c.id === conv.id)
  if (idx >= 0) {
    all[idx] = conv
  } else {
    all.unshift(conv)
  }
  // Keep last 50 conversations
  await chrome.storage.local.set({ [CONVERSATIONS_KEY]: all.slice(0, 50) })
}

export async function getCurrentConversationId(): Promise<string | null> {
  const result = await chrome.storage.local.get(CURRENT_CONV_KEY)
  return (result[CURRENT_CONV_KEY] as string) ?? null
}

export async function setCurrentConversationId(id: string | null): Promise<void> {
  await chrome.storage.local.set({ [CURRENT_CONV_KEY]: id })
}

export type { Conversation }
