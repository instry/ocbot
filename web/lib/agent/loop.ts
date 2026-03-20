import type { LlmProvider, LlmRequestMessage, ToolCallPart } from '../llm/types'
import type { ActCache } from './cache'
import type { Variables } from './variables'
import { streamChat } from '../llm/client'
import { BROWSER_TOOLS, executeTool } from './tools'
import { DESKTOP_TOOLS } from '../desktop/tools'
import { buildSystemPrompt } from './systemPrompt'
import { ensureAttached, sendCdp } from './cdp'
import { sendMessage } from '../messaging'
import { getDesktopEnabled } from '../storage'
import {
  type AgentReplayStep,
  toolCallToReplayStep,
} from './agentCache'
import { matchSkill } from '@/lib/skills/matcher'
import { SkillStore } from '@/lib/skills/store'
import { SkillRunner } from '@/lib/skills/runner'
import type { Skill, SkillMatch, SkillParameter } from '@/lib/skills/types'
import { extractSkillParams, getMissingParams } from '@/lib/skills/paramExtractor'

const MAX_TURNS = 100

export interface AgentCallbacks {
  onTextDelta: (text: string) => void
  onToolCallStart: (id: string, name: string, args?: string) => void
  onToolCallEnd: (id: string, name: string, result: string) => void
  onAssistantMessage: (content: string, toolCalls: ToolCallPart[]) => void
  onToolMessage: (toolCallId: string, name: string, result: string) => void
  onError: (error: string) => void
  onSkillMatch?: (match: SkillMatch) => Promise<boolean> // return true to execute skill
  onMissingParams?: (
    skill: Skill,
    extracted: Record<string, string>,
    missing: SkillParameter[],
  ) => Promise<Record<string, string> | null>  // null = cancel
  onRecordedSteps?: (steps: AgentReplayStep[], instruction: string, startUrl: string) => void
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

const TAG = '[ocbot:agent]'

export async function runAgentLoop(
  provider: LlmProvider,
  messages: LlmRequestMessage[],
  callbacks: AgentCallbacks,
  signal?: AbortSignal,
  cache?: ActCache,
  variables?: Variables,
): Promise<void> {
  console.group(`${TAG} ▶ Agent started`)
  const t0 = performance.now()
  const pageContext = await getPageContext()

  // Pre-load page text content (lightweight) so the agent can answer reading tasks immediately
  let initialPageContent: string | undefined
  if (pageContext?.url) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const tabId = tab?.id
      if (tabId) {
        const article = await sendMessage('getArticleContent', undefined, tabId)
        if (article.content) {
          initialPageContent = article.content
        }
      }
    } catch { /* best effort */ }
  }

  // Desktop mode — merge desktop tools if enabled
  const desktopEnabled = await getDesktopEnabled()
  const activeTools = desktopEnabled
    ? [...BROWSER_TOOLS, ...DESKTOP_TOOLS]
    : BROWSER_TOOLS

  const systemMessage: LlmRequestMessage = {
    role: 'system',
    content: buildSystemPrompt(pageContext, variables, initialPageContent, desktopEnabled),
  }

  // Extract the user instruction (last user message) for skill matching
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  let userInstruction = ''
  const content = lastUserMsg?.content
  if (content) {
    if (typeof content === 'string') {
      userInstruction = content
    } else if (Array.isArray(content)) {
      userInstruction = content
        .map((p) => (p.type === 'text' ? p.text : ''))
        .filter(Boolean)
        .join('\n')
    }
  }
  const startUrl = pageContext?.url || ''
  const skillStore = new SkillStore()
  console.log(`${TAG} instruction: "${userInstruction}"`)
  console.log(`${TAG} page: ${startUrl || '(no page)'}`)
  console.log(`${TAG} provider: ${provider.name} / ${provider.modelId}`)
  console.log(`${TAG} desktop: ${desktopEnabled ? 'ON' : 'OFF'} (${activeTools.length} tools)`)

  // --- Skill matching (user skills) ---
  if (userInstruction) {
    const skillMatch = await matchSkill(
      userInstruction,
      startUrl,
      provider,
      skillStore,
      signal,
    )

    if (skillMatch && callbacks.onSkillMatch) {
      console.log(`${TAG} 🎯 Skill matched: "${skillMatch.skill.name}" (confidence: ${skillMatch.confidence})`)
      const shouldRun = await callbacks.onSkillMatch(skillMatch)
      if (shouldRun) {
        const skill = skillMatch.skill

        // --- Parameter extraction ---
        let mergedParams: Record<string, string> = {}

        if (skill.parameters.length > 0) {
          // Build defaults
          const defaults: Record<string, string> = {}
          for (const p of skill.parameters) {
            if (p.default != null) defaults[p.name] = String(p.default)
          }

          // LLM extraction
          const extracted = await extractSkillParams(userInstruction, skill.parameters, provider, signal)
          console.log(`${TAG} 📋 Extracted params:`, extracted)

          // Check for missing required params
          const missing = getMissingParams(skill.parameters, { ...defaults, ...extracted })

          if (missing.length > 0) {
            if (callbacks.onMissingParams) {
              const userFilled = await callbacks.onMissingParams(skill, extracted, missing)
              if (userFilled === null) {
                // User cancelled — fall through to agent loop
                console.log(`${TAG} ❌ User cancelled param input, falling back to agent loop`)
              } else {
                mergedParams = { ...defaults, ...extracted, ...userFilled }
              }
            } else {
              // No callback to ask user — fall through to agent loop
              console.log(`${TAG} ⚠ Missing params but no onMissingParams callback, falling back to agent loop`)
            }
          } else {
            mergedParams = { ...defaults, ...extracted }
          }

          // If mergedParams is still empty and there were missing params, skip skill execution
          if (missing.length > 0 && Object.keys(mergedParams).length === 0) {
            // Fall through to normal agent loop
          } else {
            // Execute skill with params
            const runner = new SkillRunner(skillStore)
            const result = await runner.execute(
              skill,
              mergedParams,
              provider,
              cache!,
              {
                onStepStart: (i, step) => callbacks.onToolCallStart(`skill-step-${i}`, step.type),
                onStepEnd: (i, step, res) => callbacks.onToolCallEnd(`skill-step-${i}`, step.type, res),
                onTrackSwitch: () => {},
                onHeal: () => {},
                onTextDelta: callbacks.onTextDelta,
              },
              signal,
              variables,
            )

            if (result.success) {
              console.log(`${TAG} ✅ Skill completed (${result.track} track, ${result.durationMs}ms)`)
              console.groupEnd()
              callbacks.onTextDelta(
                `Skill "${skill.name}" completed successfully (${result.track} track, ${result.durationMs}ms).`,
              )
              callbacks.onAssistantMessage(
                `Skill "${skill.name}" completed successfully (${result.track} track, ${result.durationMs}ms).`,
                [],
              )
              return
            }
            // Skill failed — fall through to normal agent loop
            console.log(`${TAG} ❌ Skill execution failed, falling back to agent loop`)
          }
        } else {
          // No parameters — execute directly
          const runner = new SkillRunner(skillStore)
          const result = await runner.execute(
            skill,
            variables ?? {},
            provider,
            cache!,
            {
              onStepStart: (i, step) => callbacks.onToolCallStart(`skill-step-${i}`, step.type),
              onStepEnd: (i, step, res) => callbacks.onToolCallEnd(`skill-step-${i}`, step.type, res),
              onTrackSwitch: () => {},
              onHeal: () => {},
              onTextDelta: callbacks.onTextDelta,
            },
            signal,
            variables,
          )

          if (result.success) {
            console.log(`${TAG} ✅ Skill completed (${result.track} track, ${result.durationMs}ms)`)
            console.groupEnd()
            callbacks.onTextDelta(
              `Skill "${skill.name}" completed successfully (${result.track} track, ${result.durationMs}ms).`,
            )
            callbacks.onAssistantMessage(
              `Skill "${skill.name}" completed successfully (${result.track} track, ${result.durationMs}ms).`,
              [],
            )
            return
          }
          // Skill failed — fall through to normal agent loop
          console.log(`${TAG} ❌ Skill execution failed, falling back to agent loop`)
        }
      }
    }
  }

  // --- Normal LLM loop ---
  console.log(`${TAG} 🤖 Entering LLM loop`)

  const allMessages: LlmRequestMessage[] = [systemMessage, ...messages]
  const recordedSteps: AgentReplayStep[] = []
  // Global tool call counter — ensures unique IDs across all turns
  let globalToolCallIndex = 0

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) return
    console.group(`${TAG} Turn ${turn + 1}`)

    let textContent = ''
    let reasoningContent = ''
    const toolCalls: Map<string, { id: string; name: string; arguments: string }> = new Map()

    try {
      for await (const event of streamChat(provider, allMessages, activeTools, signal)) {
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
            const id = event.id || `tc_${globalToolCallIndex}`
            toolCalls.set(id, { id, name: event.name, arguments: '' })
            callbacks.onToolCallStart(id, event.name)
            globalToolCallIndex++
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
      if (signal?.aborted) { console.groupEnd(); console.groupEnd(); return }
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`${TAG} ❌ Error:`, msg)
      console.groupEnd() // turn
      console.groupEnd() // agent
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
      console.log(`${TAG} 💬 LLM responded with text (no tool calls), done`)
      console.groupEnd() // turn
      console.log(`${TAG} ⏱ Agent finished in ${(performance.now() - t0).toFixed(0)}ms`)
      console.groupEnd() // agent
      // Expose recorded steps for "Save as Skill"
      if (recordedSteps.length > 0 && userInstruction && callbacks.onRecordedSteps) {
        callbacks.onRecordedSteps(recordedSteps, userInstruction, startUrl)
      }
      return
    }

    // Execute tool calls and add results
    console.log(`${TAG} 🔧 LLM requested ${toolCallArray.length} tool call(s)`)
    for (const tc of toolCallArray) {
      if (signal?.aborted) return

      let parsedArgs: unknown
      try { parsedArgs = JSON.parse(tc.arguments || '{}') } catch { parsedArgs = tc.arguments }
      console.log(`${TAG}   ┌ ${tc.name}`, parsedArgs)
      // Update tool status with args now that streaming is complete
      callbacks.onToolCallStart(tc.id, tc.name, tc.arguments)
      const toolT0 = performance.now()
      const result = await executeTool(tc.name, tc.arguments, provider, cache!, signal, variables)
      const toolMs = (performance.now() - toolT0).toFixed(0)
      try {
        const parsed = JSON.parse(result)
        console.log(`${TAG}   └ ${tc.name} (${toolMs}ms)`, parsed)
      } catch {
        console.log(`${TAG}   └ ${tc.name} (${toolMs}ms)`, result.slice(0, 200))
      }
      callbacks.onToolCallEnd(tc.id, tc.name, result)
      callbacks.onToolMessage(tc.id, tc.name, result)

      // Auto-screenshot after navigate — so LLM sees the new page visually
      if (tc.name === 'navigate') {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          if (tab?.id) {
            await ensureAttached(tab.id)
            const { data } = await sendCdp<{ data: string }>(tab.id, 'Page.captureScreenshot', {
              format: 'jpeg',
              quality: 70,
              optimizeForSpeed: true,
            })
            allMessages.push({
              role: 'tool',
              content: result,
              toolCallId: tc.id,
            })
            allMessages.push({
              role: 'user',
              content: [
                { type: 'image', mediaType: 'image/jpeg', data },
                { type: 'text', text: 'Page loaded. Here is a screenshot of the current page.' },
              ],
            })
            console.log(`${TAG} 📸 Auto-screenshot after navigate (${Math.round(data.length / 1024)}KB)`)
            // Record step
            try {
              const args = JSON.parse(tc.arguments || '{}')
              const step = toolCallToReplayStep(tc.name, args, result)
              if (step) recordedSteps.push(step)
            } catch { /* skip */ }
            continue // skip the default tool message push below
          }
        } catch { /* fallback — just push text result */ }
      }

      // Screenshot tool returns image data — inject as multimodal user message
      if (tc.name === 'screenshot' || tc.name === 'desktop_screenshot') {
        try {
          const parsed = JSON.parse(result)
          if (parsed.__screenshot__ && parsed.data) {
            // Tool result is a text placeholder for the LLM
            allMessages.push({
              role: 'tool',
              content: JSON.stringify({ screenshot: 'captured', sizeKB: parsed.sizeKB }),
              toolCallId: tc.id,
            })
            // Actual image goes as a user message so the LLM can see it
            allMessages.push({
              role: 'user',
              content: [
                { type: 'image', mediaType: 'image/jpeg', data: parsed.data },
                { type: 'text', text: 'Here is the current page screenshot.' },
              ],
            })
            console.log(`${TAG} 📸 Screenshot captured (${parsed.sizeKB}KB${tc.name === 'desktop_screenshot' ? ', desktop' : ''})`)
            continue // skip the default tool message push below
          }
        } catch { /* fall through to normal handling */ }
      }

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

    console.groupEnd() // turn
  }

  // Safety limit reached
  console.log(`${TAG} ⚠ Safety limit (${MAX_TURNS} turns) reached`)
  console.groupEnd() // agent
  if (recordedSteps.length > 0 && userInstruction && callbacks.onRecordedSteps) {
    callbacks.onRecordedSteps(recordedSteps, userInstruction, startUrl)
  }
  callbacks.onAssistantMessage('I\'ve completed the actions I could perform. Let me know if you need anything else.', [])
}
