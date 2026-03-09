import type { SupportedStorage } from '@supabase/supabase-js'

const PREFIX = 'ocbot_supabase_'

export const chromeStorageAdapter: SupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    const storeKey = PREFIX + key
    const result = await chrome.storage.local.get(storeKey)
    return result[storeKey] ?? null
  },

  async setItem(key: string, value: string): Promise<void> {
    const storeKey = PREFIX + key
    await chrome.storage.local.set({ [storeKey]: value })
  },

  async removeItem(key: string): Promise<void> {
    const storeKey = PREFIX + key
    await chrome.storage.local.remove(storeKey)
  },
}
