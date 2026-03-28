import { create } from 'zustand'
import type { ChannelPlatform, ChannelConfig, ChannelStatus, ChannelTestResult } from '@/types/channel'
import { useGatewayStore } from './gateway-store'

interface ChannelStore {
  configs: Partial<Record<ChannelPlatform, ChannelConfig>>
  statuses: Partial<Record<ChannelPlatform, ChannelStatus>>
  selectedPlatform: ChannelPlatform | null
  loading: boolean
  error: string | null

  setSelectedPlatform: (platform: ChannelPlatform | null) => void
  loadConfig: (platform: ChannelPlatform) => Promise<void>
  saveConfig: (platform: ChannelPlatform, config: ChannelConfig) => Promise<void>
  loadStatuses: () => Promise<void>
  startGateway: (platform: ChannelPlatform) => Promise<void>
  stopGateway: (platform: ChannelPlatform) => Promise<void>
  testConnection: (platform: ChannelPlatform) => Promise<ChannelTestResult>
}

export const useChannelStore = create<ChannelStore>((set, get) => ({
  configs: {},
  statuses: {},
  selectedPlatform: null,
  loading: false,
  error: null,

  setSelectedPlatform: (platform) => {
    set({ selectedPlatform: platform })
  },

  loadConfig: async (platform) => {
    const client = useGatewayStore.getState().client
    if (!client) return

    try {
      set({ loading: true, error: null })
      const config = await client.call('channels.getConfig', { platform }) as ChannelConfig
      set((state) => ({
        configs: { ...state.configs, [platform]: config },
        loading: false,
      }))
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  saveConfig: async (platform, config) => {
    const client = useGatewayStore.getState().client
    if (!client) return

    try {
      set({ loading: true, error: null })
      await client.call('channels.setConfig', { platform, config })
      set((state) => ({
        configs: { ...state.configs, [platform]: config },
        loading: false,
      }))
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  loadStatuses: async () => {
    const client = useGatewayStore.getState().client
    if (!client) return

    try {
      const result = await client.call('channels.status') as { statuses?: Record<string, ChannelStatus> }
      if (result.statuses) {
        set({ statuses: result.statuses })
      }
    } catch (err) {
      console.error('Failed to load channel statuses:', err)
    }
  },

  startGateway: async (platform) => {
    const client = useGatewayStore.getState().client
    if (!client) return

    try {
      set({ loading: true, error: null })
      await client.call('channels.start', { platform })
      await get().loadStatuses()
      set({ loading: false })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  stopGateway: async (platform) => {
    const client = useGatewayStore.getState().client
    if (!client) return

    try {
      set({ loading: true, error: null })
      await client.call('channels.stop', { platform })
      await get().loadStatuses()
      set({ loading: false })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  testConnection: async (platform) => {
    const client = useGatewayStore.getState().client
    if (!client) throw new Error('Gateway client not available')

    set({ loading: true, error: null })
    try {
      const result = await client.call('channels.test', { platform }) as ChannelTestResult
      set({ loading: false })
      return result
    } catch (err) {
      set({ error: String(err), loading: false })
      throw err
    }
  },
}))
