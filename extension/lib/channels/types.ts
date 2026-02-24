export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface InboundMessage {
  channelType: string
  senderId: string
  senderName: string
  chatId: string
  text: string
  messageId: string
}

export interface OutboundMessage {
  chatId: string
  text?: string
  photo?: Blob
  replyToMessageId?: string
}

export interface ChannelAdapter {
  readonly type: string
  readonly status: ChannelStatus
  start(config: ChannelConfig, onMessage: (msg: InboundMessage) => void): Promise<void>
  stop(): Promise<void>
  send(msg: OutboundMessage): Promise<void>
  onStatusChange(cb: (status: ChannelStatus, error?: string) => void): void
}

export interface ChannelConfig {
  id: string
  type: 'telegram'
  enabled: boolean
  botToken?: string
  allowedChatIds?: string[]
  createdAt: number
  updatedAt: number
}
