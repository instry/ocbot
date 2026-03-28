/**
 * Channel Types
 * 消息平台 Channel 相关类型定义
 */

export type ChannelPlatform =
  | 'feishu'
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'whatsapp'
  | 'dingtalk'
  | 'qq'
  | 'wecom'
  | 'weixin'

export type ChannelPolicy = 'open' | 'disabled' | 'pairing' | 'allowlist'

export interface ChannelConfig {
  enabled: boolean
  appId?: string
  appSecret?: string
  botToken?: string
  clientId?: string
  clientSecret?: string
  botId?: string
  secret?: string
  accountId?: string
  dmPolicy: ChannelPolicy
  groupPolicy: ChannelPolicy
}

export interface ChannelStatus {
  connected: boolean
  startedAt: number | null
  lastError: string | null
  botInfo?: {
    id?: string
    username?: string
    name?: string
  }
  lastInboundAt?: number | null
  lastOutboundAt?: number | null
}

export interface ChannelTestResult {
  platform: ChannelPlatform
  verdict: 'pass' | 'warn' | 'fail'
  checks: Array<{
    level: 'pass' | 'warn' | 'fail'
    message: string
    suggestion?: string
  }>
  testedAt: number
}

export interface ChannelInfo {
  id: ChannelPlatform
  label: string
  desc: string
  icon?: string
}

export const CHANNEL_PLATFORMS: ChannelInfo[] = [
  { id: 'feishu', label: 'Feishu', desc: 'Feishu/Lark messaging platform' },
  { id: 'dingtalk', label: 'DingTalk', desc: 'DingTalk messaging platform' },
  { id: 'wecom', label: 'WeCom', desc: 'WeChat Work' },
  { id: 'weixin', label: 'Weixin', desc: 'WeChat' },
  { id: 'qq', label: 'QQ', desc: 'QQ Bot' },
  { id: 'telegram', label: 'Telegram', desc: 'Telegram Bot' },
  { id: 'discord', label: 'Discord', desc: 'Discord Bot' },
  { id: 'slack', label: 'Slack', desc: 'Slack Bot' },
  { id: 'whatsapp', label: 'WhatsApp', desc: 'WhatsApp Business' },
]
