import { create } from 'zustand'
import type {
  ChannelPlatform,
  ChannelConfig,
  ChannelPairingRequest,
  ChannelQrLoginStartResult,
  ChannelQrLoginWaitResult,
  ChannelStatus,
  ChannelTestResult,
} from '@/types/channel'
import {
  CHANNEL_STATUS_KEYS,
  resolveQrLoginChannel,
  supportsBuiltInQrLogin,
} from '@/lib/channel-platforms'
import { useGatewayStore } from './gateway-store'

type GatewayChannelsStatusResponse = {
  channels?: Record<string, unknown>
  channelAccounts?: Record<string, unknown>
  channelDefaultAccountId?: Record<string, unknown>
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

function formatChannelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('web login provider is not available')) {
    return 'This build does not include a ready WeChat runtime. Rebuild the bundled OpenClaw runtime and try again.'
  }

  if (message.includes('web login is not supported by provider openclaw-weixin')) {
    return 'The bundled WeChat plugin is missing QR login support. Rebuild the bundled OpenClaw runtime and try again.'
  }

  return message
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

function shouldRetryWithoutChannel(error: unknown): boolean {
  const message = String(error)
  return message.includes('invalid web.login.start params')
    || message.includes('invalid web.login.wait params')
    || (message.includes("unexpected property 'channel'") || message.includes('unexpected property "channel"'))
}

async function callWebLoginStart(
  platform: ChannelPlatform,
  timeoutMs: number,
): Promise<ChannelQrLoginStartResult> {
  const client = useGatewayStore.getState().client
  if (!client) throw new Error('Gateway client not available')

  const paramsWithChannel = {
    channel: resolveQrLoginChannel(platform),
    force: true,
    timeoutMs,
    verbose: true,
  }

  try {
    return await client.call<ChannelQrLoginStartResult>('web.login.start', paramsWithChannel, timeoutMs + 10000)
  } catch (error) {
    if (!shouldRetryWithoutChannel(error)) {
      throw error
    }

    return await client.call<ChannelQrLoginStartResult>('web.login.start', {
      force: true,
      timeoutMs,
      verbose: true,
    }, timeoutMs + 10000)
  }
}

async function callWebLoginWait(
  platform: ChannelPlatform,
  timeoutMs: number,
  accountId?: string,
): Promise<ChannelQrLoginWaitResult> {
  const client = useGatewayStore.getState().client
  if (!client) throw new Error('Gateway client not available')

  const paramsWithChannel = {
    channel: resolveQrLoginChannel(platform),
    timeoutMs,
    ...(accountId ? { accountId } : {}),
  }

  try {
    return await client.call<ChannelQrLoginWaitResult>('web.login.wait', paramsWithChannel, timeoutMs + 10000)
  } catch (error) {
    if (!shouldRetryWithoutChannel(error)) {
      throw error
    }

    return await client.call<ChannelQrLoginWaitResult>('web.login.wait', {
      timeoutMs,
      ...(accountId ? { accountId } : {}),
    }, timeoutMs + 10000)
  }
}

async function hasQrLoginProvider(platform: ChannelPlatform): Promise<boolean> {
  if (!supportsBuiltInQrLogin(platform)) {
    return false
  }

  if (platform === 'whatsapp') {
    return true
  }

  return await window.ocbot?.supportsChannelQrLogin?.(platform) === true
}

interface ChannelStore {
  configs: Partial<Record<ChannelPlatform, ChannelConfig>>
  statuses: Partial<Record<ChannelPlatform, ChannelStatus>>
  pairingRequests: Partial<Record<ChannelPlatform, ChannelPairingRequest[]>>
  allowFrom: Partial<Record<ChannelPlatform, string[]>>
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
  loadPairingRequests: (platform: ChannelPlatform) => Promise<void>
  approvePairingCode: (platform: ChannelPlatform, code: string) => Promise<boolean>
  rejectPairingRequest: (platform: ChannelPlatform, code: string) => Promise<boolean>
  startQrLogin: (platform: ChannelPlatform) => Promise<ChannelQrLoginStartResult>
  waitQrLogin: (platform: ChannelPlatform, accountId?: string) => Promise<ChannelQrLoginWaitResult>
}

export const useChannelStore = create<ChannelStore>((set, get) => ({
  configs: {},
  statuses: {},
  pairingRequests: {},
  allowFrom: {},
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
        throw new Error('Ocbot desktop bridge not available')
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
        throw new Error('Ocbot desktop bridge not available')
      }
      const savedConfig = await window.ocbot.saveChannelConfig(platform, config) as ChannelConfig
      await get().loadStatuses()
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

  loadPairingRequests: async (platform) => {
    try {
      if (!window.ocbot?.listChannelPairingRequests) {
        throw new Error('Ocbot pairing bridge not available')
      }
      const result = await window.ocbot.listChannelPairingRequests(platform)
      set((state) => ({
        pairingRequests: { ...state.pairingRequests, [platform]: result.requests ?? [] },
        allowFrom: { ...state.allowFrom, [platform]: result.allowFrom ?? [] },
      }))
    } catch (err) {
      set({ error: String(err) })
    }
  },

  approvePairingCode: async (platform, code) => {
    try {
      set({ loading: true, error: null })
      if (!window.ocbot?.approveChannelPairingCode) {
        throw new Error('Ocbot pairing bridge not available')
      }
      const result = await window.ocbot.approveChannelPairingCode(platform, code)
      if (result.approved) {
        await get().loadPairingRequests(platform)
        await get().loadStatuses()
      }
      set({ loading: false })
      return result.approved
    } catch (err) {
      set({ error: String(err), loading: false })
      return false
    }
  },

  rejectPairingRequest: async (platform, code) => {
    try {
      set({ loading: true, error: null })
      if (!window.ocbot?.rejectChannelPairingRequest) {
        throw new Error('Ocbot pairing bridge not available')
      }
      const result = await window.ocbot.rejectChannelPairingRequest(platform, code)
      if (result.rejected) {
        await get().loadPairingRequests(platform)
      }
      set({ loading: false })
      return result.rejected
    } catch (err) {
      set({ error: String(err), loading: false })
      return false
    }
  },

  startQrLogin: async (platform) => {
    const client = useGatewayStore.getState().client
    if (!client) throw new Error('Gateway client not available')
    if (!(await hasQrLoginProvider(platform))) {
      throw new Error(platform === 'weixin'
        ? 'This build does not include a ready WeChat runtime.'
        : 'QR login is not available for this channel')
    }

    set({ loading: true, error: null })
    try {
      const result = await callWebLoginStart(platform, 300000)
      set({ loading: false })
      return result
    } catch (err) {
      set({ error: formatChannelError(err), loading: false })
      throw err
    }
  },

  waitQrLogin: async (platform, accountId) => {
    const client = useGatewayStore.getState().client
    if (!client) throw new Error('Gateway client not available')
    if (!(await hasQrLoginProvider(platform))) {
      throw new Error(platform === 'weixin'
        ? 'This build does not include a ready WeChat runtime.'
        : 'QR login is not available for this channel')
    }

    set({ loading: true, error: null })
    try {
      const resolvedAccountId = platform === 'weixin'
        ? (typeof accountId === 'string' ? accountId.trim() : '')
        : accountId
      const result = await callWebLoginWait(platform, 480000, resolvedAccountId || undefined)
      if (result.connected) {
        const currentConfig = get().configs[platform]
          ?? await window.ocbot?.getChannelConfig(platform)
        if (currentConfig && window.ocbot?.saveChannelConfig) {
          const savedConfig = await window.ocbot.saveChannelConfig(platform, {
            ...currentConfig,
            enabled: true,
            ...(result.accountId ? { accountId: result.accountId } : {}),
          })
          set((state) => ({
            configs: {
              ...state.configs,
              [platform]: savedConfig as ChannelConfig,
            },
          }))
        }
      }
      await get().loadStatuses()
      set({ loading: false })
      return result
    } catch (err) {
      set({ error: formatChannelError(err), loading: false })
      throw err
    }
  },
}))
