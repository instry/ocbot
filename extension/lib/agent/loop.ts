import type { LlmProvider, LlmRequestMessage, ToolCallPart } from '../llm/types'
import type { ActCache } from './cache'
import type { Variables } from './variables'
import { streamChat } from '../llm/client'
import { BROWSER_TOOLS, executeTool } from './tools'
import { buildSystemPrompt } from './systemPrompt'
import { variableKeysForCache } from './variables'
import {
  AgentCache,
  type AgentReplayStep,
  toolCallToReplayStep,
  replayAgentSteps,
  getConfigSignature,
} from './agentCache'

const MAX_TURNS = 100

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
  cache?: ActCache,
  variables?: Variables,
  agentCache?: AgentCache,
): Promise<void> {
  const pageContext = await getPageContext()
  const systemMessage: LlmRequestMessage = {
    role: 'system',
    content: buildSystemPrompt(pageContext, variables),
  }

  // Extract the user instruction (last user message) for agent cache key
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const userInstruction = lastUserMsg?.content || ''
  const startUrl = pageContext?.url || ''
  const varKeys = variables ? variableKeysForCache(variables) : []
  const configSig = getConfigSignature(provider)

  // --- Agent cache replay ---
  if (agentCache && userInstruction) {
    const cached = await agentCache.lookup(userInstruction, startUrl, varKeys, configSig)
    if (cached && cached.steps.length > 0) {
      console.log('[ocbot] AgentCache hit, replaying', cached.steps.length, 'steps')

      const executeForReplay = (name: string, argsJson: string) =>
        executeTool(name, argsJson, provider, cache!, signal, variables)

      const replayResult = await replayAgentSteps(
        cached.steps,
        executeForReplay,
        {
          onStepStart: (i, step) => {
            callbacks.onToolCallStart(`replay_${i}`, step.type)
          },
          onStepEnd: (i, step, result) => {
            callbacks.onToolCallEnd(`replay_${i}`, step.type, result)
          },
          onSkip: () => { /* no-op for skipped steps */ },
        },
        signal,
      )

      if (replayResult.success) {
        callbacks.onTextDelta('Task completed successfully (from cache).')
        callbacks.onAssistantMessage('Task completed successfully (from cache).', [])
        return
      }

      // Replay failed — fall through to normal LLM loop
      console.log('[ocbot] AgentCache replay failed at step', replayResult.failedIndex, ', falling back to LLM')
    }
  }

  // --- Normal LLM loop ---
  const allMessages: LlmRequestMessage[] = [systemMessage, ...messages]
  const recordedSteps: AgentReplayStep[] = []

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) return

    let textContent = ''
    let reasoningContent = ''
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

          case 'reasoning_delta':
            reasoningContent += event.text
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
      reasoningContent: reasoningContent || undefined,
    })

    // If no tool calls, we're done — assistant gave a text response
    if (toolCallArray.length === 0) {
      // Store recorded steps in agent cache
      if (agentCache && userInstruction && recordedSteps.length > 0) {
        await agentCache.store(userInstruction, startUrl, varKeys, configSig, recordedSteps)
      }
      return
    }

    // Execute tool calls and add results
    for (const tc of toolCallArray) {
      if (signal?.aborted) return

      const result = await executeTool(tc.name, tc.arguments, provider, cache!, signal, variables)
      callbacks.onToolCallEnd(tc.id, tc.name, result)
      callbacks.onToolMessage(tc.id, tc.name, result)

      allMessages.push({
        role: 'tool',
        content: result,
        toolCallId: tc.id,
      })

      // Record step for agent cache
      try {
        const args = JSON.parse(tc.arguments || '{}')
        const step = toolCallToReplayStep(tc.name, args, result)
        if (step) recordedSteps.push(step)
      } catch { /* skip recording on parse error */ }
    }
  }

  // Safety limit reached — store what we have and send final message
  if (agentCache && userInstruction && recordedSteps.length > 0) {
    await agentCache.store(userInstruction, startUrl, varKeys, configSig, recordedSteps)
  }
  callbacks.onAssistantMessage('I\'ve completed the actions I could perform. Let me know if you need anything else.', [])
}
