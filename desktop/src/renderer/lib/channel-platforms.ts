import type { ChannelPlatform } from '@/types/channel'

export const CHANNEL_STATUS_KEYS: Record<ChannelPlatform, string> = {
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

export const PRIORITY_CHANNELS: readonly ChannelPlatform[] = ['weixin', 'feishu']

export function supportsBuiltInQrLogin(platform: ChannelPlatform): boolean {
  return platform === 'whatsapp' || platform === 'weixin'
}

export function requiresDesktopQrCapability(platform: ChannelPlatform): boolean {
  return platform === 'weixin'
}

export function resolveQrLoginChannel(platform: ChannelPlatform): string {
  return CHANNEL_STATUS_KEYS[platform]
}
