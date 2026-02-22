import type { LlmProvider, LlmRequestMessage, LlmStreamEvent, ToolCallPart } from '../llm/types'
import { streamChat } from '../llm/client'
import { BROWSER_TOOLS, executeTool } from './tools'
import { buildSystemPrompt } from './systemPrompt'

const MAX_ITERATIONS = 20

export interface AgentCallbacks {
  onTextDelta: (text: string) => void
  onToolCallStart: (id: string, name: string) => void
  onToolCallEnd: (id: string, name: string, result: string) => void
  onAssistantMessage: (content: string, toolCalls: ToolCallPart[]) => void
  onToolMessage: (toolCallId: string, name: string, result: string) => void
  onError: (error: string) => void
}

async function getPageContext(): Promise<{ url: string; title: string } | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.url && tab?.title) {
      return { url: tab.url, title: tab.title }
    }
  } catch { /* no context available */ }
  return undefined
}

export async function runAgentLoop(
  provider: LlmProvider,
  messages: LlmRequestMessage[],
  callbacks: AgentCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const pageContext = await getPageContext()
  const systemMessage: LlmRequestMessage = {
    role: 'system',
    content: buildSystemPrompt(pageContext),
  }

  const allMessages: LlmRequestMessage[] = [systemMessage, ...messages]

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return

    let textContent = ''
    const toolCalls: Map<string, { id: string; name: string; arguments: string }> = new Map()
    // Track tool calls by index for OpenAI streaming (where id comes only on first chunk)
    let currentToolCallIndex = 0

    try {
      for await (const event of streamChat(provider, allMessages, BROWSER_TOOLS, signal)) {
        if (signal?.aborted) return

        switch (event.type) {
          case 'text_delta':
            textContent += event.text
            callbacks.onTextDelta(event.text)
            break

          case 'tool_call_start': {
            const id = event.id || `tc_${currentToolCallIndex}`
            toolCalls.set(id, { id, name: event.name, arguments: '' })
            callbacks.onToolCallStart(id, event.name)
            currentToolCallIndex++
            break
          }

          case 'tool_call_delta': {
            // Find the tool call — try exact id first, then last added
            let tc = toolCalls.get(event.id)
            if (!tc) {
              // For OpenAI, delta may come with empty id — use the last tool call
              const entries = Array.from(toolCalls.values())
              tc = entries[entries.length - 1]
            }
            if (tc) {
              tc.arguments += event.arguments
            }
            break
          }

          case 'error':
            callbacks.onError(event.error)
            return

          case 'done':
            break
        }
      }
    } catch (err: unknown) {
      if (signal?.aborted) return
      const msg = err instanceof Error ? err.message : String(err)
      callbacks.onError(msg)
      return
    }

    const toolCallArray = Array.from(toolCalls.values())

    // Notify assistant message
    callbacks.onAssistantMessage(textContent, toolCallArray)

    // Add assistant message to history
    allMessages.push({
      role: 'assistant',
      content: textContent || undefined,
      toolCalls: toolCallArray.length > 0 ? toolCallArray : undefined,
    })

    // If no tool calls, we're done — assistant gave a text response
    if (toolCallArray.length === 0) {
      return
    }

    // Execute tool calls and add results
    for (const tc of toolCallArray) {
      if (signal?.aborted) return

      const result = await executeTool(tc.name, tc.arguments)
      callbacks.onToolCallEnd(tc.id, tc.name, result)
      callbacks.onToolMessage(tc.id, tc.name, result)

      allMessages.push({
        role: 'tool',
        content: result,
        toolCallId: tc.id,
      })
    }
  }

  callbacks.onError('Reached maximum iterations (20). Stopping.')
}
