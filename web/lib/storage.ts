import type { Conversation } from './types'
import type { ChannelConfig } from './channels/types'
import { storage } from './storage-backend'

const STORAGE_KEYS = {
  inputHistory: 'ocbot_input_history',
  channelConfigs: 'ocbot_channel_configs',
  openClawConfig: 'ocbot_openclaw_config',
  onboardingComplete: 'ocbot_onboarding_complete',
  selectedModel: 'ocbot_selected_model',
} as const

const MAX_INPUT_HISTORY = 100

// --- Conversation persistence ---

const CONVERSATIONS_KEY = 'ocbot_conversations'

export async function getConversations(): Promise<Conversation[]> {
  const result = await storage.get(CONVERSATIONS_KEY)
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
  await storage.set({ [CONVERSATIONS_KEY]: all.slice(0, 50) })
}

export async function deleteConversation(id: string): Promise<void> {
  const all = await getConversations()
  const filtered = all.filter(c => c.id !== id)
  await storage.set({ [CONVERSATIONS_KEY]: filtered })
}

// --- Input History ---

export async function getUserInputHistory(): Promise<string[]> {
  const result = await storage.get(STORAGE_KEYS.inputHistory)
  return (result[STORAGE_KEYS.inputHistory] as string[]) || []
}

export async function saveUserInputHistory(history: string[]): Promise<void> {
  await storage.set({
    [STORAGE_KEYS.inputHistory]: history.slice(-MAX_INPUT_HISTORY),
  })
}

// --- Channel Config CRUD ---

export async function getChannelConfigs(): Promise<ChannelConfig[]> {
  const result = await storage.get(STORAGE_KEYS.channelConfigs)
  return (result[STORAGE_KEYS.channelConfigs] as ChannelConfig[]) || []
}

export async function saveChannelConfig(config: ChannelConfig): Promise<void> {
  const all = await getChannelConfigs()
  const idx = all.findIndex(c => c.id === config.id)
  if (idx >= 0) {
    all[idx] = { ...config, updatedAt: Date.now() }
  } else {
    all.push(config)
  }
  await storage.set({ [STORAGE_KEYS.channelConfigs]: all })
}

export async function deleteChannelConfig(id: string): Promise<void> {
  const all = await getChannelConfigs()
  const filtered = all.filter(c => c.id !== id)
  await storage.set({ [STORAGE_KEYS.channelConfigs]: filtered })
}

// --- OpenClaw Config ---

export interface OpenClawConfig {
  gatewayUrl: string
}

const DEFAULT_OPENCLAW_CONFIG: OpenClawConfig = {
  gatewayUrl: 'http://127.0.0.1:18789',
}

export async function getOpenClawConfig(): Promise<OpenClawConfig> {
  const result = await storage.get(STORAGE_KEYS.openClawConfig)
  return {
    ...DEFAULT_OPENCLAW_CONFIG,
    ...((result[STORAGE_KEYS.openClawConfig] as Partial<OpenClawConfig>) || {}),
  }
}

export async function setOpenClawConfig(config: OpenClawConfig): Promise<void> {
  await storage.set({ [STORAGE_KEYS.openClawConfig]: config })
}

// --- Onboarding ---

export async function isOnboardingComplete(): Promise<boolean> {
  const result = await storage.get(STORAGE_KEYS.onboardingComplete)
  return !!result[STORAGE_KEYS.onboardingComplete]
}

export async function setOnboardingComplete(): Promise<void> {
  await storage.set({ [STORAGE_KEYS.onboardingComplete]: true })
}

// --- Selected Model ---

export async function getSelectedModel(): Promise<string | null> {
  const result = await storage.get(STORAGE_KEYS.selectedModel)
  return (result[STORAGE_KEYS.selectedModel] as string) || null
}

export async function setSelectedModel(model: string | null): Promise<void> {
  await storage.set({ [STORAGE_KEYS.selectedModel]: model ?? '' })
}
