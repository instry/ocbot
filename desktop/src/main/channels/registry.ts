import type { ChannelConfigMap, DesktopChannelConfig, DesktopChannelPlatform } from './types'

export const DEFAULT_CHANNEL_CONFIG: DesktopChannelConfig = {
  enabled: false,
  dmPolicy: 'open',
  groupPolicy: 'open',
}

export const CHANNEL_CONFIG_MAP: Record<DesktopChannelPlatform, ChannelConfigMap> = {
  feishu: {
    channelKey: 'feishu',
    credentials: { appId: 'appId', appSecret: 'appSecret' },
  },
  telegram: {
    channelKey: 'telegram',
    credentials: { botToken: 'botToken' },
  },
  discord: {
    channelKey: 'discord',
    credentials: { botToken: 'token' },
  },
  slack: {
    channelKey: 'slack',
    credentials: { botToken: 'botToken' },
  },
  whatsapp: {
    channelKey: 'whatsapp',
    credentials: {},
    supportsGroupPolicy: false,
  },
  dingtalk: {
    channelKey: 'dingtalk-connector',
    credentials: { clientId: 'clientId', clientSecret: 'clientSecret' },
  },
  qq: {
    channelKey: 'qqbot',
    credentials: { appId: 'appId', appSecret: 'clientSecret' },
  },
  wecom: {
    channelKey: 'wecom',
    credentials: { botId: 'botId', secret: 'secret' },
  },
  weixin: {
    channelKey: 'openclaw-weixin',
    credentials: { accountId: 'accountId' },
  },
}
