import type { ProviderAdapter, LlmProvider, LlmRequestMessage, ToolDefinition, LlmStreamEvent } from '../types'

function convertMessages(messages: LlmRequestMessage[]) {
  const contents: unknown[] = []

  for (const m of messages) {
    if (m.role === 'system') continue

    if (m.role === 'assistant' && m.toolCalls?.length) {
      const parts: unknown[] = []
      if (m.content) {
        parts.push({ text: m.content })
      }
      for (const tc of m.toolCalls) {
        let args: unknown = {}
        try { args = JSON.parse(tc.arguments) } catch { /* keep empty */ }
        parts.push({
          functionCall: { name: tc.name, args },
        })
      }
      contents.push({ role: 'model', parts })
      continue
    }

    if (m.role === 'tool') {
      let result: unknown = {}
      try { result = JSON.parse(m.content || '{}') } catch {
        result = { result: m.content }
      }
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: m.toolCallId || 'unknown',
            response: result,
          },
        }],
      })
      continue
    }

    contents.push({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || '' }],
    })
  }

  return contents
}

function convertTools(tools: ToolDefinition[]) {
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }]
}

export const googleAdapter: ProviderAdapter = {
  buildRequest(provider: LlmProvider, messages: LlmRequestMessage[], tools?: ToolDefinition[]) {
    const baseUrl = (provider.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
    const systemMsg = messages.find(m => m.role === 'system')

    const body: Record<string, unknown> = {
      contents: convertMessages(messages),
    }

    if (systemMsg?.content) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] }
    }

    if (tools?.length) {
      body.tools = convertTools(tools)
    }

    return {
      url: `${baseUrl}/models/${provider.modelId}:streamGenerateContent?alt=sse&key=${provider.apiKey}`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  },

  parseSSELine(line: string): LlmStreamEvent[] {
    if (!line.startsWith('data: ')) return []
    const data = line.slice(6).trim()

    try {
      const json = JSON.parse(data)
      const parts = json.candidates?.[0]?.content?.parts
      if (!parts) return []

      const events: LlmStreamEvent[] = []

      for (const part of parts) {
        if (part.text) {
          events.push({ type: 'text_delta', text: part.text })
        }
        if (part.functionCall) {
          const id = `google_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          events.push({
            type: 'tool_call_start',
            id,
            name: part.functionCall.name,
          })
          events.push({
            type: 'tool_call_delta',
            id,
            arguments: JSON.stringify(part.functionCall.args || {}),
          })
        }
      }

      // Check for finish
      const finishReason = json.candidates?.[0]?.finishReason
      if (finishReason === 'STOP' || finishReason === 'MAX_TOKENS') {
        events.push({ type: 'done' })
      }

      return events
    } catch {
      return []
    }
  },
}
