import type { ProviderAdapter, LlmProvider, LlmRequestMessage, ToolDefinition, LlmStreamEvent } from '../types'

function convertMessages(messages: LlmRequestMessage[]) {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
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
          content: m.content || '',
        }
      }
      return { role: m.role, content: m.content || '' }
    })
}

function convertTools(tools: ToolDefinition[]) {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

export const openaiAdapter: ProviderAdapter = {
  buildRequest(provider: LlmProvider, messages: LlmRequestMessage[], tools?: ToolDefinition[]) {
    const baseUrl = (provider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const systemMsg = messages.find(m => m.role === 'system')

    const body: Record<string, unknown> = {
      model: provider.modelId,
      messages: [
        ...(systemMsg ? [{ role: 'system', content: systemMsg.content }] : []),
        ...convertMessages(messages),
      ],
      stream: true,
    }

    if (tools?.length) {
      body.tools = convertTools(tools)
    }

    return {
      url: `${baseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    }
  },

  parseSSELine(line: string): LlmStreamEvent[] {
    if (!line.startsWith('data: ')) return []
    const data = line.slice(6).trim()
    if (data === '[DONE]') return [{ type: 'done' }]

    try {
      const json = JSON.parse(data)
      const delta = json.choices?.[0]?.delta
      if (!delta) return []

      const events: LlmStreamEvent[] = []

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            events.push({
              type: 'tool_call_start',
              id: tc.id || '',
              name: tc.function.name,
            })
          }
          if (tc.function?.arguments) {
            events.push({
              type: 'tool_call_delta',
              id: tc.id || '',
              arguments: tc.function.arguments,
            })
          }
        }
      }

      if (delta.content) {
        events.push({ type: 'text_delta', text: delta.content })
      }

      return events
    } catch {
      return []
    }
  },
}
