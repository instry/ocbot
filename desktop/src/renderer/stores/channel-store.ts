import { create } from 'zustand'
import type { ChannelPlatform, ChannelConfig, ChannelStatus, ChannelTestResult } from '@/types/channel'
import { useGatewayStore } from './gateway-store'

type GatewayChannelsStatusResponse = {
  channels?: Record<string, unknown>
  channelAccounts?: Record<string, unknown>
  channelDefaultAccountId?: Record<string, unknown>
}

const CHANNEL_STATUS_KEYS: Record<ChannelPlatform, string> = {
  feishu: 'feishu',
  telegram: 'telegram',
  discord: 'discord',
  slack: 'slack',
  whatsapp: 'whatsapp',
  dingtalk: 'dingtalk-connector',
  qq: 'qqbot',
  wecom: 'wecom',
  weixin: 'openclaw-weixin',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function readBotInfo(value: unknown): ChannelStatus['botInfo'] | undefined {
  const raw = asRecord(value)
  const id = readString(raw.id)
  const username = readString(raw.username) ?? readString(raw.handle)
  const name = readString(raw.name) ?? readString(raw.displayName)
  if (!id && !username && !name) return undefined
  return { id, username, name }
}

function readLastError(snapshot: Record<string, unknown>, summary: Record<string, unknown>): string | null {
  const direct = readString(snapshot.lastError) ?? readString(summary.lastError) ?? readString(summary.error)
  if (direct) return direct

  const lastDisconnect = asRecord(snapshot.lastDisconnect)
  return readString(lastDisconnect.error) ?? null
}

function pickDefaultAccount(
  accounts: unknown,
  defaultAccountId: unknown,
): Record<string, unknown> {
  const accountList = asArray(accounts).filter(isRecord)
  if (accountList.length === 0) return {}

  const resolvedDefaultAccountId = typeof defaultAccountId === 'string' ? defaultAccountId : undefined
  if (!resolvedDefaultAccountId) return accountList[0]

  return accountList.find(account => account.accountId === resolvedDefaultAccountId) ?? accountList[0]
}

function mapGatewayStatus(payload: GatewayChannelsStatusResponse): Partial<Record<ChannelPlatform, ChannelStatus>> {
  const channels = asRecord(payload.channels)
  const channelAccounts = asRecord(payload.channelAccounts)
  const channelDefaultAccountId = asRecord(payload.channelDefaultAccountId)

  const entries = Object.entries(CHANNEL_STATUS_KEYS).map(([platform, channelKey]) => {
    const summary = asRecord(channels[channelKey])
    const snapshot = pickDefaultAccount(channelAccounts[channelKey], channelDefaultAccountId[channelKey])
    const connected = Boolean(snapshot.connected ?? snapshot.running ?? summary.connected ?? false)
    const startedAt = readNumber(snapshot.lastStartAt)
      ?? readNumber(snapshot.lastConnectedAt)
      ?? readNumber(summary.startedAt)
      ?? null
    const botInfo = readBotInfo(snapshot.bot)
      ?? readBotInfo(snapshot.profile)
      ?? readBotInfo(snapshot.application)
      ?? readBotInfo(summary.bot)
      ?? (() => {
        const name = readString(snapshot.name)
        const id = readString(snapshot.accountId)
        return name || id ? { id, name } : undefined
      })()

    return [
      platform as ChannelPlatform,
      {
        connected,
        startedAt,
        lastError: readLastError(snapshot, summary),
        botInfo,
        lastInboundAt: readNumber(snapshot.lastInboundAt)
          ?? readNumber(snapshot.lastEventAt)
          ?? readNumber(summary.lastInboundAt)
          ?? null,
        lastOutboundAt: readNumber(snapshot.lastOutboundAt)
          ?? readNumber(summary.lastOutboundAt)
          ?? null,
      } satisfies ChannelStatus,
    ]
  })

  return Object.fromEntries(entries)
}

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
    try {
      set({ loading: true, error: null })
      if (!window.ocbot?.getChannelConfig) {
        throw new Error('Electron channel config bridge not available')
      }
      const config = await window.ocbot.getChannelConfig(platform) as ChannelConfig
      set((state) => ({
        configs: { ...state.configs, [platform]: config },
        loading: false,
      }))
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  saveConfig: async (platform, config) => {
    try {
      set({ loading: true, error: null })
      if (!window.ocbot?.saveChannelConfig) {
        throw new Error('Electron channel config bridge not available')
      }
      const savedConfig = await window.ocbot.saveChannelConfig(platform, config) as ChannelConfig
      set((state) => ({
        configs: { ...state.configs, [platform]: savedConfig },
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
      const result = await client.call<GatewayChannelsStatusResponse>('channels.status', { probe: false })
      set({ statuses: mapGatewayStatus(result ?? {}) })
    } catch (err) {
      console.error('Failed to load channel statuses:', err)
    }
  },

  startGateway: async (platform) => {
    try {
      set({ loading: true, error: null })
      const currentConfig = get().configs[platform]
        ?? await window.ocbot?.getChannelConfig(platform)
      if (!currentConfig) {
        throw new Error('Channel config not available')
      }
      const savedConfig = await window.ocbot?.saveChannelConfig(platform, {
        ...currentConfig,
        enabled: true,
      })
      set((state) => ({
        configs: {
          ...state.configs,
          [platform]: (savedConfig ?? { ...currentConfig, enabled: true }) as ChannelConfig,
        },
      }))
      await get().loadStatuses()
      set({ loading: false })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  stopGateway: async (platform) => {
    try {
      set({ loading: true, error: null })
      const currentConfig = get().configs[platform]
        ?? await window.ocbot?.getChannelConfig(platform)
      if (!currentConfig) {
        throw new Error('Channel config not available')
      }
      const savedConfig = await window.ocbot?.saveChannelConfig(platform, {
        ...currentConfig,
        enabled: false,
      })
      set((state) => ({
        configs: {
          ...state.configs,
          [platform]: (savedConfig ?? { ...currentConfig, enabled: false }) as ChannelConfig,
        },
      }))
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
