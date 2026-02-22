import type { ProviderAdapter, LlmProvider, LlmRequestMessage, ToolDefinition, LlmStreamEvent } from '../types'

function convertMessages(messages: LlmRequestMessage[]) {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const content: unknown[] = []
        if (m.content) {
          content.push({ type: 'text', text: m.content })
        }
        for (const tc of m.toolCalls) {
          let input: unknown = {}
          try { input = JSON.parse(tc.arguments) } catch { /* keep empty */ }
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input,
          })
        }
        return { role: 'assistant' as const, content }
      }
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{
            type: 'tool_result',
            tool_use_id: m.toolCallId!,
            content: m.content || '',
          }],
        }
      }
      return { role: m.role as 'user' | 'assistant', content: m.content || '' }
    })
}

function convertTools(tools: ToolDefinition[]) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}

export const anthropicAdapter: ProviderAdapter = {
  buildRequest(provider: LlmProvider, messages: LlmRequestMessage[], tools?: ToolDefinition[]) {
    const baseUrl = (provider.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
    const systemMsg = messages.find(m => m.role === 'system')

    const body: Record<string, unknown> = {
      model: provider.modelId,
      max_tokens: 4096,
      stream: true,
      messages: convertMessages(messages),
    }

    if (systemMsg?.content) {
      body.system = systemMsg.content
    }

    if (tools?.length) {
      body.tools = convertTools(tools)
    }

    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    }
  },

  parseSSELine(line: string, eventType?: string): LlmStreamEvent[] {
    if (!line.startsWith('data: ')) return []
    const data = line.slice(6).trim()

    try {
      const json = JSON.parse(data)

      switch (eventType || json.type) {
        case 'content_block_start': {
          const block = json.content_block
          if (block?.type === 'tool_use') {
            return [{ type: 'tool_call_start', id: block.id, name: block.name }]
          }
          return []
        }
        case 'content_block_delta': {
          const delta = json.delta
          if (delta?.type === 'text_delta' && delta.text) {
            return [{ type: 'text_delta', text: delta.text }]
          }
          if (delta?.type === 'input_json_delta' && delta.partial_json) {
            return [{ type: 'tool_call_delta', id: '', arguments: delta.partial_json }]
          }
          return []
        }
        case 'message_stop':
          return [{ type: 'done' }]
        case 'error':
          return [{ type: 'error', error: json.error?.message || 'Unknown error' }]
        default:
          return []
      }
    } catch {
      return []
    }
  },
}
