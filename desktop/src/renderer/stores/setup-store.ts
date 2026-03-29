import { create } from 'zustand'
import type { GatewayClient } from '@/gateway/client'

type SetupStatus = 'unknown' | 'checking' | 'ready' | 'needs_onboarding'

interface SetupStore {
  status: SetupStatus
  refresh: (client: GatewayClient) => Promise<void>
  reset: () => void
}

function hasConfiguredProvider(config: Record<string, any>): boolean {
  const profiles = config?.auth?.profiles
  if (profiles && typeof profiles === 'object' && Object.keys(profiles).length > 0) {
    return true
  }

  const providers = config?.models?.providers
  if (providers && typeof providers === 'object' && Object.keys(providers).length > 0) {
    return true
  }

  const primary = typeof config?.agents?.defaults?.model?.primary === 'string'
    ? config.agents.defaults.model.primary.trim()
    : ''
  return primary.length > 0
}

export const useSetupStore = create<SetupStore>((set) => ({
  status: 'unknown',

  refresh: async (client) => {
    set({ status: 'checking' })

    try {
      const result = await client.call<{ config?: Record<string, any> }>('config.get')
      const config = result?.config ?? {}
      set({ status: hasConfiguredProvider(config) ? 'ready' : 'needs_onboarding' })
    } catch {
      set({ status: 'ready' })
    }
  },

  reset: () => set({ status: 'unknown' }),
}))
