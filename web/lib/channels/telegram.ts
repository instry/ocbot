import type { ChannelAdapter, ChannelConfig, ChannelStatus, InboundMessage, OutboundMessage } from './types'

const TELEGRAM_API = 'https://api.telegram.org/bot'
const POLL_TIMEOUT = 30
const RECONNECT_DELAY = 5000
const MAX_MESSAGE_LENGTH = 4096

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; first_name?: string; username?: string }
    chat: { id: number }
    text?: string
  }
}

export class TelegramAdapter implements ChannelAdapter {
  readonly type = 'telegram'
  private _status: ChannelStatus = 'disconnected'
  private statusCallbacks: Array<(status: ChannelStatus, error?: string) => void> = []
  private abortController: AbortController | null = null
  private config: ChannelConfig | null = null
  private offset = 0

  get status(): ChannelStatus {
    return this._status
  }

  onStatusChange(cb: (status: ChannelStatus, error?: string) => void): void {
    this.statusCallbacks.push(cb)
  }

  private setStatus(status: ChannelStatus, error?: string): void {
    this._status = status
    for (const cb of this.statusCallbacks) {
      cb(status, error)
    }
  }

  private apiUrl(method: string): string {
    return `${TELEGRAM_API}${this.config!.botToken}/${method}`
  }

  async start(config: ChannelConfig, onMessage: (msg: InboundMessage) => void): Promise<void> {
    if (!config.botToken) throw new Error('Bot token is required')

    this.config = config
    this.abortController = new AbortController()
    this.setStatus('connecting')

    // Validate token
    const me = await this.apiCall('getMe')
    if (!me.ok) {
      this.setStatus('error', 'Invalid bot token')
      throw new Error('Invalid bot token')
    }

    this.setStatus('connected')
    this.pollLoop(onMessage)
  }

  async stop(): Promise<void> {
    this.abortController?.abort()
    this.abortController = null
    this.setStatus('disconnected')
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.config?.botToken) return

    if (msg.photo) {
      const form = new FormData()
      form.append('chat_id', msg.chatId)
      form.append('photo', msg.photo, 'screenshot.png')
      if (msg.replyToMessageId) form.append('reply_to_message_id', msg.replyToMessageId)
      await fetch(this.apiUrl('sendPhoto'), { method: 'POST', body: form })
      return
    }

    if (msg.text) {
      // Split long messages at 4096 char boundary
      const chunks = splitMessage(msg.text, MAX_MESSAGE_LENGTH)
      for (const chunk of chunks) {
        await this.apiCall('sendMessage', {
          chat_id: msg.chatId,
          text: chunk,
          reply_to_message_id: msg.replyToMessageId,
        })
      }
    }
  }

  async sendChatAction(chatId: string, action: string = 'typing'): Promise<void> {
    await this.apiCall('sendChatAction', { chat_id: chatId, action }).catch(() => {})
  }

  private async apiCall(method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown }> {
    const resp = await fetch(this.apiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: this.abortController?.signal,
    })
    return resp.json()
  }

  private async pollLoop(onMessage: (msg: InboundMessage) => void): Promise<void> {
    const signal = this.abortController?.signal

    while (!signal?.aborted) {
      try {
        const resp = await fetch(this.apiUrl('getUpdates'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset: this.offset,
            timeout: POLL_TIMEOUT,
            allowed_updates: ['message'],
          }),
          signal,
        })

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`)
        }

        const data = await resp.json() as { ok: boolean; result: TelegramUpdate[] }
        if (!data.ok || !data.result) continue

        for (const update of data.result) {
          this.offset = update.update_id + 1

          if (!update.message?.text) continue

          const chatId = String(update.message.chat.id)
          const senderId = String(update.message.from?.id ?? update.message.chat.id)

          // Check allowlist
          if (this.config!.allowedChatIds && this.config!.allowedChatIds.length > 0) {
            if (!this.config!.allowedChatIds.includes(chatId)) continue
          } else if (update.message.text === '/start') {
            // Auto-capture first /start sender
            this.config!.allowedChatIds = [chatId]
            // Notify about auto-binding (status change triggers UI update)
            this.setStatus('connected')
          }

          onMessage({
            channelType: 'telegram',
            senderId,
            senderName: update.message.from?.first_name ?? update.message.from?.username ?? 'Unknown',
            chatId,
            text: update.message.text,
            messageId: String(update.message.message_id),
          })
        }

        // Restore connected if recovering from error
        if (this._status === 'error') {
          this.setStatus('connected')
        }
      } catch (err: unknown) {
        if (signal?.aborted) return

        const msg = err instanceof Error ? err.message : String(err)
        this.setStatus('error', msg)

        // Backoff before retry
        await new Promise(r => setTimeout(r, RECONNECT_DELAY))
      }
    }
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    // Try to split at last newline within limit
    let splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt <= 0) splitAt = maxLen
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  return chunks
}
