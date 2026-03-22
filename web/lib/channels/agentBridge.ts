import type { LlmRequestMessage } from '../llm/types'
import type { ChannelAdapter, InboundMessage } from './types'
import { runAgentLoop } from '../agent/loop'
import type { AgentCallbacks } from '../agent/loop'
import { ActCache } from '../agent/cache'
import { getOpenClawConfig, getSelectedModel } from '../storage'
import { TelegramAdapter } from './telegram'

type ConversationMap = Map<string, LlmRequestMessage[]>

const conversations: ConversationMap = new Map()
const actCache = new ActCache()

// Execution queue: one agent run at a time
let runningPromise: Promise<void> = Promise.resolve()

export async function handleInboundMessage(adapter: ChannelAdapter, msg: InboundMessage): Promise<void> {
  // Handle special commands
  if (msg.text === '/clear') {
    conversations.delete(msg.chatId)
    await adapter.send({ chatId: msg.chatId, text: 'Conversation cleared.', replyToMessageId: msg.messageId })
    return
  }

  if (msg.text === '/screenshot') {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
      const resp = await fetch(dataUrl)
      const blob = await resp.blob()
      await adapter.send({ chatId: msg.chatId, photo: blob, replyToMessageId: msg.messageId })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await adapter.send({ chatId: msg.chatId, text: `Screenshot failed: ${errMsg}`, replyToMessageId: msg.messageId })
    }
    return
  }

  if (msg.text === '/start') {
    await adapter.send({ chatId: msg.chatId, text: 'Connected! Send me a message and I\'ll control the browser for you.' })
    return
  }

  // Queue the agent run
  runningPromise = runningPromise.then(() => executeAgentRun(adapter, msg))
  await runningPromise
}

async function executeAgentRun(adapter: ChannelAdapter, msg: InboundMessage): Promise<void> {
  // Get gateway config and selected model
  const { gatewayUrl } = await getOpenClawConfig()
  const model = await getSelectedModel()

  if (!model) {
    await adapter.send({ chatId: msg.chatId, text: 'No model selected. Set one up in the extension settings.', replyToMessageId: msg.messageId })
    return
  }

  // Get or create conversation
  if (!conversations.has(msg.chatId)) {
    conversations.set(msg.chatId, [])
  }
  const history = conversations.get(msg.chatId)!

  // Add user message
  history.push({ role: 'user', content: msg.text })

  // Send typing indicator
  if (adapter instanceof TelegramAdapter) {
    await adapter.sendChatAction(msg.chatId)
  }

  // Run agent
  let responseText = ''
  const callbacks: AgentCallbacks = {
    onTextDelta: (text) => {
      responseText += text
    },
    onToolCallStart: () => {
      // Send typing action to show activity
      if (adapter instanceof TelegramAdapter) {
        adapter.sendChatAction(msg.chatId).catch(() => {})
      }
    },
    onToolCallEnd: () => {},
    onAssistantMessage: (content, toolCalls) => {
      // Store assistant message in history
      history.push({
        role: 'assistant',
        content: content || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      })
    },
    onToolMessage: (toolCallId, _name, result) => {
      history.push({
        role: 'tool',
        content: result,
        toolCallId,
      })
    },
    onError: (error) => {
      responseText = `Error: ${error}`
    },
  }

  try {
    await runAgentLoop(gatewayUrl, model, [...history.slice(0, -1)], callbacks, undefined, actCache)

    // Only send the final text response (not intermediate tool-use messages)
    if (responseText.trim()) {
      await adapter.send({ chatId: msg.chatId, text: responseText, replyToMessageId: msg.messageId })
    }

    // Cap conversation history to avoid token overflow
    if (history.length > 40) {
      const trimmed = history.slice(-30)
      conversations.set(msg.chatId, trimmed)
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await adapter.send({ chatId: msg.chatId, text: `Agent error: ${errMsg}`, replyToMessageId: msg.messageId })
  }
}
