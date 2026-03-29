export type DesktopChannelPlatform =
  | 'feishu'
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'whatsapp'
  | 'dingtalk'
  | 'qq'
  | 'wecom'
  | 'weixin'

export type DesktopChannelPolicy = 'open' | 'disabled' | 'pairing' | 'allowlist'

export type DesktopChannelConfig = {
  enabled: boolean
  appId?: string
  appSecret?: string
  domain?: string
  botToken?: string
  clientId?: string
  clientSecret?: string
  botId?: string
  secret?: string
  accountId?: string
  dmPolicy: DesktopChannelPolicy
  groupPolicy: DesktopChannelPolicy
}

export type DesktopPairingRequest = {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

export type ChannelConfigMap = {
  channelKey: string
  credentials: Partial<Record<keyof DesktopChannelConfig, string>>
  supportsDmPolicy?: boolean
  supportsGroupPolicy?: boolean
}
