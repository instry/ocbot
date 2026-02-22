import type { LlmProvider, LlmRequestMessage, ToolDefinition, LlmStreamEvent, ProviderAdapter } from './types'
import { getProviderFamily } from './types'
import { openaiAdapter } from './adapters/openai'
import { anthropicAdapter } from './adapters/anthropic'
import { googleAdapter } from './adapters/google'

function getAdapter(provider: LlmProvider): ProviderAdapter {
  const family = getProviderFamily(provider.type)
  switch (family) {
    case 'anthropic': return anthropicAdapter
    case 'google': return googleAdapter
    default: return openaiAdapter
  }
}

export async function* streamChat(
  provider: LlmProvider,
  messages: LlmRequestMessage[],
  tools?: ToolDefinition[],
  signal?: AbortSignal,
): AsyncGenerator<LlmStreamEvent> {
  const adapter = getAdapter(provider)
  const { url, headers, body } = adapter.buildRequest(provider, messages, tools)

  const debugInfo = `[url=${url}] [auth=${headers.Authorization ? 'Bearer ...' + provider.apiKey?.slice(-4) : 'MISSING'}] [key_len=${provider.apiKey?.length ?? 0}]`

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    yield { type: 'error', error: `HTTP ${response.status}: ${text.slice(0, 200)}\n${debugInfo}` }
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    yield { type: 'error', error: 'No response body' }
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEventType = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          currentEventType = ''
          continue
        }

        // Anthropic uses "event: xxx" lines
        if (trimmed.startsWith('event: ')) {
          currentEventType = trimmed.slice(7).trim()
          continue
        }

        if (trimmed.startsWith('data: ')) {
          const events = adapter.parseSSELine(trimmed, currentEventType || undefined)
          for (const event of events) {
            yield event
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const events = adapter.parseSSELine(buffer.trim(), currentEventType || undefined)
      for (const event of events) {
        yield event
      }
    }
  } finally {
    reader.releaseLock()
  }
}
