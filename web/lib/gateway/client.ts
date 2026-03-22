import type { LlmRequestMessage, LlmStreamEvent, ToolDefinition, ContentPart } from '../llm/types'

// ---------------------------------------------------------------------------
// WebSocket RPC — for config/query methods (models.list, config.*, wizard.*)
// ---------------------------------------------------------------------------

export async function gatewayRequest(
  gatewayUrl: string,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const wsUrl = gatewayUrl.replace(/^http/, 'ws')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const id = crypto.randomUUID()
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('gateway request timed out'))
    }, 10_000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'req', id, method, params }))
    }
    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data)
        if (frame.type === 'res' && frame.id === id) {
          clearTimeout(timeout)
          ws.close()
          if (frame.ok) {
            resolve(frame.payload)
          } else {
            reject(new Error(frame.error?.message ?? 'gateway error'))
          }
        }
      } catch { /* ignore non-JSON frames */ }
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('gateway connection failed'))
    }
  })
}

// ---------------------------------------------------------------------------
// HTTP SSE — for LLM inference via /v1/chat/completions (OpenAI-compatible)
// ---------------------------------------------------------------------------

function convertMessagesToOpenAI(messages: LlmRequestMessage[]) {
  const systemMessages = messages.filter(m => m.role === 'system')
  const nonSystemMessages = messages.filter(m => m.role !== 'system')

  const converted = nonSystemMessages.map(m => {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant' as const,
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      }
    }
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        tool_call_id: m.toolCallId!,
        content: typeof m.content === 'string' ? m.content : '',
      }
    }
    // user / assistant with possible multimodal content
    if (Array.isArray(m.content)) {
      return {
        role: m.role,
        content: (m.content as ContentPart[]).map(part => {
          if (part.type === 'image') {
            return {
              type: 'image_url' as const,
              image_url: { url: `data:${part.mediaType};base64,${part.data}` },
            }
          }
          return { type: 'text' as const, text: part.text }
        }),
      }
    }
    return { role: m.role, content: m.content || '' }
  })

  // Prepend system messages
  const system = systemMessages.map(m => ({
    role: 'system' as const,
    content: typeof m.content === 'string' ? m.content : '',
  }))

  return [...system, ...converted]
}

function convertToolsToOpenAI(tools: ToolDefinition[]) {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

export async function* streamChat(
  gatewayUrl: string,
  model: string,
  messages: LlmRequestMessage[],
  tools?: ToolDefinition[],
  signal?: AbortSignal,
): AsyncGenerator<LlmStreamEvent> {
  const url = `${gatewayUrl}/v1/chat/completions`

  const body: Record<string, unknown> = {
    model,
    messages: convertMessagesToOpenAI(messages),
    stream: true,
  }
  if (tools?.length) {
    body.tools = convertToolsToOpenAI(tools)
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    yield { type: 'error', error: `HTTP ${response.status}: ${text.slice(0, 500)}` }
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    yield { type: 'error', error: 'No response body' }
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          yield { type: 'done' }
          return
        }

        try {
          const chunk = JSON.parse(data)
          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue

          // Text content
          if (delta.content) {
            yield { type: 'text_delta', text: delta.content }
          }

          // Reasoning content (extended thinking)
          if (delta.reasoning_content) {
            yield { type: 'reasoning_delta', text: delta.reasoning_content }
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                yield { type: 'tool_call_start', id: tc.id || '', name: tc.function.name }
              }
              if (tc.function?.arguments) {
                yield { type: 'tool_call_delta', id: tc.id || '', arguments: tc.function.arguments }
              }
            }
          }
        } catch { /* skip malformed JSON */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
