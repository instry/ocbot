import type { ChannelAdapter, ChannelConfig, ChannelStatus } from './types'
import { TelegramAdapter } from './telegram'
import { handleInboundMessage } from './agentBridge'
import { getChannelConfigs, saveChannelConfig } from '../storage'

interface ChannelEntry {
  config: ChannelConfig
  adapter: ChannelAdapter
}

const channels = new Map<string, ChannelEntry>()

function createAdapter(type: string): ChannelAdapter {
  switch (type) {
    case 'telegram':
      return new TelegramAdapter()
    default:
      throw new Error(`Unknown channel type: ${type}`)
  }
}

export async function startChannel(config: ChannelConfig): Promise<void> {
  // Stop existing if running
  await stopChannel(config.id)

  const adapter = createAdapter(config.type)

  adapter.onStatusChange((status, error) => {
    broadcastStatus(config.id, status, error)

    // Persist auto-captured allowedChatIds
    if (config.allowedChatIds && config.allowedChatIds.length > 0) {
      saveChannelConfig({ ...config, updatedAt: Date.now() }).catch(() => {})
    }
  })

  channels.set(config.id, { config, adapter })

  await adapter.start(config, (msg) => {
    handleInboundMessage(adapter, msg).catch(err => {
      console.error('[ocbot] Channel message handling error:', err)
    })
  })
}

export async function stopChannel(id: string): Promise<void> {
  const entry = channels.get(id)
  if (entry) {
    await entry.adapter.stop()
    channels.delete(id)
  }
}

export function getChannelStatus(id: string): { status: ChannelStatus; type?: string } {
  const entry = channels.get(id)
  return entry
    ? { status: entry.adapter.status, type: entry.adapter.type }
    : { status: 'disconnected' }
}

export function getAllStatuses(): Record<string, ChannelStatus> {
  const result: Record<string, ChannelStatus> = {}
  for (const [id, entry] of channels) {
    result[id] = entry.adapter.status
  }
  return result
}

export async function initFromStorage(): Promise<void> {
  const configs = await getChannelConfigs()
  for (const config of configs) {
    if (config.enabled && config.botToken) {
      startChannel(config).catch(err => {
        console.error(`[ocbot] Failed to start channel ${config.id}:`, err)
      })
    }
  }
}

function broadcastStatus(channelId: string, status: ChannelStatus, error?: string): void {
  chrome.runtime.sendMessage({
    type: 'channelStatusUpdate',
    channelId,
    status,
    error,
  }).catch(() => {}) // Ignore errors when no listeners
}
