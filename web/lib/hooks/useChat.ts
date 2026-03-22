import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatMessage, Conversation } from '@/lib/types'
import type { LlmRequestMessage } from '@/lib/llm/types'
import type { AgentReplayStep } from '@/lib/agent/agentCache'
import type { Skill, SkillParameter } from '@/lib/skills/types'
import { runAgentLoop } from '@/lib/agent/loop'
import { ActCache } from '@/lib/agent/cache'
import { createSkillFromExecution } from '@/lib/skills/create'
import { SkillStore } from '@/lib/skills/store'
import { SkillRunner } from '@/lib/skills/runner'
import { saveConversation, getConversations, deleteConversation } from '@/lib/storage'
import { createT, detectSystemLocale } from '@/lib/i18n'

export interface ToolStatus {
  id: string
  name: string
  status: 'running' | 'done'
  description?: string
  result?: string
}

const actCache = new ActCache()
const t = createT(detectSystemLocale())

function generateTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')
  if (!firstUserMsg) return t('chat.newChat')
  const text = firstUserMsg.content.trim()
  return text.length > 30 ? text.slice(0, 30) + '…' : text
}

export function useChat(gatewayUrl: string, model: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState(() => `conv_${Date.now()}`)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pendingSkillSave, setPendingSkillSave] = useState<{
    steps: AgentReplayStep[]
    instruction: string
    startUrl: string
  } | null>(null)
  const [pendingSkillParams, setPendingSkillParams] = useState<Skill | null>(null)
  const [prefillParams, setPrefillParams] = useState<Record<string, string>>({})
  const paramResolveRef = useRef<((params: Record<string, string> | null) => void) | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Track the current conversation's title for saving
  const convMetaRef = useRef<{ title?: string }>({})

  const refreshConversations = useCallback(async () => {
    const convs = await getConversations()
    setConversations(convs)
    return convs
  }, [])

  useEffect(() => {
    getConversations().then(convs => {
      setConversations(convs)
    })
  }, [])

  // Auto-save conversation when messages change
  useEffect(() => {
    if (messages.length === 0) return
    const title = convMetaRef.current.title || generateTitle(messages)
    const conv: Conversation = {
      id: conversationId,
      messages,
      createdAt: messages[0].createdAt,
      updatedAt: Date.now(),
      title,
    }
    saveConversation(conv).then(() => refreshConversations())
  }, [messages, conversationId, refreshConversations])

  const loadConversation = useCallback(async (id: string) => {
    let conv = conversations.find(c => c.id === id)
    if (!conv) {
      // conversations state may not be populated yet (race on mount)
      const all = await getConversations()
      conv = all.find(c => c.id === id)
      if (!conv) return
      setConversations(all)
    }
    setConversationId(conv.id)
    setMessages(conv.messages)
    convMetaRef.current = { title: conv.title }
    setStreamingText('')
    setToolStatuses([])
    setError(null)
  }, [conversations])

  const removeConversation = useCallback(async (id: string) => {
    await deleteConversation(id)
    const convs = await refreshConversations()
    if (id === conversationId) {
      // Switch to next conversation or start fresh
      if (convs.length > 0) {
        const next = convs[0]
        setConversationId(next.id)
        setMessages(next.messages)
        convMetaRef.current = { title: next.title }
      } else {
        setMessages([])
        setConversationId(`conv_${Date.now()}`)
        convMetaRef.current = {}
      }
      setStreamingText('')
      setToolStatuses([])
      setError(null)
    }
  }, [conversationId, refreshConversations])

  const sendMessage = useCallback(async (text: string) => {
    if (!model || !text.trim() || isLoading) return

    setError(null)
    setIsLoading(true)
    setStreamingText('')
    setToolStatuses([])

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text.trim(),
      createdAt: Date.now(),
    }

    setMessages(prev => [...prev, userMsg])

    // Build LLM messages from chat history
    const allMessages = [...messages, userMsg]
    const llmMessages: LlmRequestMessage[] = allMessages.map(m => {
      if (m.role === 'tool' && m.toolResult) {
        return {
          role: 'tool' as const,
          content: m.toolResult.result,
          toolCallId: m.toolResult.toolCallId,
        }
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: m.content || undefined,
          toolCalls: m.toolCalls,
        }
      }
      return {
        role: m.role === 'tool' ? 'tool' as const : m.role as 'user' | 'assistant',
        content: m.content,
      }
    })

    const abortController = new AbortController()
    abortRef.current = abortController

    let currentText = ''

    try {
      await runAgentLoop(
        gatewayUrl,
        model,
        llmMessages,
        {
          onTextDelta: (text) => {
            currentText += text
            setStreamingText(currentText)
          },
          onToolCallStart: (id, name, args) => {
            let description: string | undefined
            if (args) {
              try {
                const parsed = JSON.parse(args)
                if (name === 'act') {
                  description = parsed.instruction || (parsed.method ? `${parsed.method} element` : undefined)
                } else if (name === 'navigate') {
                  const url = parsed.url || ''
                  description = url.length > 50 ? url.slice(0, 50) + '…' : url
                } else if (name === 'extract' || name === 'observe') {
                  description = parsed.instruction
                } else if (name === 'scroll') {
                  description = parsed.direction || 'down'
                } else if (name === 'think') {
                  description = parsed.thought?.slice(0, 60)
                } else if (name === 'fillForm') {
                  description = (parsed.fields || []).map((f: { field: string }) => f.field).join(', ')
                }
              } catch { /* ignore */ }
            }
            setToolStatuses(prev => {
              // Update existing (from streaming start) or add new
              const exists = prev.find(ts => ts.id === id)
              if (exists) {
                return prev.map(ts => ts.id === id ? { ...ts, description } : ts)
              }
              return [...prev, { id, name, status: 'running', description }]
            })
          },
          onToolCallEnd: (id, name, result) => {
            let description: string | undefined
            try {
              const parsed = JSON.parse(result)
              description = parsed.description
            } catch { /* ignore */ }
            setToolStatuses(prev =>
              prev.map(ts => ts.id === id ? {
                ...ts,
                status: 'done' as const,
                result,
                description: description || ts.description,
              } : ts)
            )
          },
          onAssistantMessage: (content, toolCalls) => {
            if (content || toolCalls.length > 0) {
              const assistantMsg: ChatMessage = {
                id: `msg_${Date.now()}_assistant`,
                role: 'assistant',
                content: content || '',
                createdAt: Date.now(),
                toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                })) : undefined,
              }
              setMessages(prev => [...prev, assistantMsg])
              currentText = ''
              setStreamingText('')
            }
          },
          onToolMessage: (toolCallId, name, result) => {
            const safeResult = (result ?? '').slice(0, 500)
            const toolMsg: ChatMessage = {
              id: `msg_${Date.now()}_tool_${toolCallId}`,
              role: 'tool',
              content: safeResult,
              createdAt: Date.now(),
              toolResult: { toolCallId, name, result: safeResult },
            }
            setMessages(prev => [...prev, toolMsg])
          },
          onError: (error) => {
            setError(error)
          },
          onRecordedSteps: async (steps, instruction, startUrl) => {
            // Don't prompt if a user skill already covers this site
            try {
              const store = new SkillStore()
              const existing = await store.list()
              const instrLower = instruction.toLowerCase()
              const hasMatchingSkill = existing.some(s => {
                if (s.source !== 'user') return false
                // Check hostname match
                try {
                  if (startUrl && s.startUrl &&
                    new URL(s.startUrl).hostname === new URL(startUrl).hostname) {
                    // Check if skill name words overlap with instruction
                    const nameWords = s.name.toLowerCase().split(/[\s\-_]+/).filter(w => w.length >= 2)
                    return nameWords.some(w => instrLower.includes(w))
                  }
                } catch { /* ignore URL parse errors */ }
                return false
              })
              if (hasMatchingSkill) return
            } catch { /* proceed to show prompt on error */ }
            setPendingSkillSave({ steps, instruction, startUrl })
          },
          onSkillMatch: async () => true,
          onMissingParams: async (skill, extracted, _missing) => {
            return new Promise<Record<string, string> | null>((resolve) => {
              paramResolveRef.current = resolve
              setPrefillParams(extracted)
              setPendingSkillParams(skill)
            })
          },
        },
        abortController.signal,
        actCache,
        undefined, // variables
      )
    } catch (err: unknown) {
      if (abortController.signal.aborted) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
      setStreamingText('')
      abortRef.current = null
    }
  }, [model, messages, isLoading])

  const executeSkill = useCallback(async (skill: Skill, params: Record<string, string>) => {
    if (!model) return

    setError(null)
    setIsLoading(true)
    setStreamingText('')
    setToolStatuses([])

    // Show a user-like message so it's clear what happened
    const paramSummary = Object.entries(params).length > 0
      ? `\n${Object.entries(params).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
      : ''
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: `Run skill: ${skill.name}${paramSummary}`,
      createdAt: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])

    const abortController = new AbortController()
    abortRef.current = abortController
    let currentText = ''

    try {
      const runner = new SkillRunner(new SkillStore())
      const result = await runner.execute(
        skill,
        params,
        gatewayUrl,
        model,
        actCache,
        {
          onStepStart: (i, step) => {
            const id = `skill-step-${i}`
            setToolStatuses(prev => [...prev, { id, name: step.type, status: 'running' }])
          },
          onStepEnd: (i, step, res) => {
            const id = `skill-step-${i}`
            let description: string | undefined
            try { description = JSON.parse(res).description } catch { /* ignore */ }
            setToolStatuses(prev =>
              prev.map(ts => ts.id === id ? { ...ts, status: 'done' as const, result: res, description } : ts)
            )
          },
          onTrackSwitch: () => {
            // Clear fast-track tool statuses so agent-track starts fresh
            setToolStatuses([])
          },
          onHeal: () => {},
          onTextDelta: (text) => {
            currentText += text
            setStreamingText(currentText)
          },
          onToolCallStart: (id, name, args) => {
            let description: string | undefined
            if (args) {
              try {
                const parsed = JSON.parse(args)
                if (name === 'act') {
                  description = parsed.instruction || (parsed.method ? `${parsed.method} element` : undefined)
                } else if (name === 'navigate') {
                  const url = parsed.url || ''
                  description = url.length > 50 ? url.slice(0, 50) + '…' : url
                } else if (name === 'extract' || name === 'observe') {
                  description = parsed.instruction
                } else if (name === 'scroll') {
                  description = parsed.direction || 'down'
                } else if (name === 'think') {
                  description = parsed.thought?.slice(0, 60)
                } else if (name === 'fillForm') {
                  description = (parsed.fields || []).map((f: { field: string }) => f.field).join(', ')
                }
              } catch { /* ignore */ }
            }
            setToolStatuses(prev => {
              const exists = prev.find(ts => ts.id === id)
              if (exists) {
                return prev.map(ts => ts.id === id ? { ...ts, description } : ts)
              }
              return [...prev, { id, name, status: 'running', description }]
            })
          },
          onToolCallEnd: (id, _name, result) => {
            let description: string | undefined
            try {
              const parsed = JSON.parse(result)
              description = parsed.description
            } catch { /* ignore */ }
            setToolStatuses(prev =>
              prev.map(ts => ts.id === id ? {
                ...ts,
                status: 'done' as const,
                result,
                description: description || ts.description,
              } : ts)
            )
          },
          onAssistantMessage: (content, toolCalls) => {
            if (content || toolCalls.length > 0) {
              const assistantMsg: ChatMessage = {
                id: `msg_${Date.now()}_assistant`,
                role: 'assistant',
                content: content || '',
                createdAt: Date.now(),
                toolCalls: toolCalls.length > 0 ? toolCalls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                })) : undefined,
              }
              setMessages(prev => [...prev, assistantMsg])
              currentText = ''
              setStreamingText('')
            }
          },
          onToolMessage: (toolCallId, name, result) => {
            const safeResult = (result ?? '').slice(0, 500)
            const toolMsg: ChatMessage = {
              id: `msg_${Date.now()}_tool_${toolCallId}`,
              role: 'tool',
              content: safeResult,
              createdAt: Date.now(),
              toolResult: { toolCallId, name, result: safeResult },
            }
            setMessages(prev => [...prev, toolMsg])
          },
        },
        abortController.signal,
        undefined, // variables
      )

      const summary = result.success
        ? `Skill "${skill.name}" completed successfully (${result.track} track, ${result.durationMs}ms).`
        : `Skill "${skill.name}" failed (${result.track} track, ${result.durationMs}ms).`

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: summary,
        createdAt: Date.now(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setIsLoading(false)
      setStreamingText('')
      abortRef.current = null
    }
  }, [model])

  const runSkill = useCallback(async (skillId: string) => {
    if (!model || isLoading) return

    const store = new SkillStore()
    const skill = await store.get(skillId)
    if (!skill) {
      setError(`Skill not found: ${skillId}`)
      return
    }

    // Check if skill has required parameters that need user input
    const requiredParams = skill.parameters.filter(p => p.required && p.default == null)
    if (requiredParams.length > 0) {
      // Show parameter form in chat
      setPendingSkillParams(skill)
      return
    }

    // No required params — build defaults and execute immediately
    const params: Record<string, string> = {}
    for (const p of skill.parameters) {
      if (p.default != null) params[p.name] = String(p.default)
    }
    await executeSkill(skill, params)
  }, [model, isLoading, executeSkill])

  const confirmSkillParams = useCallback(async (params: Record<string, string>) => {
    const skill = pendingSkillParams
    if (!skill) return
    setPendingSkillParams(null)
    setPrefillParams({})

    // If there's a pending resolve from onMissingParams, resolve it instead of executing directly
    if (paramResolveRef.current) {
      paramResolveRef.current(params)
      paramResolveRef.current = null
      return
    }

    await executeSkill(skill, params)
  }, [pendingSkillParams, executeSkill])

  const cancelSkillParams = useCallback(() => {
    setPendingSkillParams(null)
    setPrefillParams({})

    // If there's a pending resolve from onMissingParams, cancel it
    if (paramResolveRef.current) {
      paramResolveRef.current(null)
      paramResolveRef.current = null
    }
  }, [])

  const stopAgent = useCallback(() => {
    abortRef.current?.abort()
    setIsLoading(false)
    setStreamingText('')
  }, [])

  const newChat = useCallback(() => {
    setMessages([])
    setConversationId(`conv_${Date.now()}`)
    convMetaRef.current = {}
    setStreamingText('')
    setToolStatuses([])
    setError(null)
    setPendingSkillSave(null)
  }, [])

  const saveAsSkill = useCallback(async () => {
    if (!pendingSkillSave || !model) return
    const { steps, instruction, startUrl } = pendingSkillSave
    setPendingSkillSave(null)

    // Save a placeholder immediately so it shows up in My Skills as "Creating..."
    const placeholderId = crypto.randomUUID()
    const store = new SkillStore()
    const now = Date.now()
    await store.save({
      id: placeholderId,
      name: instruction.length > 30 ? instruction.slice(0, 30) + '…' : instruction,
      description: instruction,
      version: 1,
      categories: [],
      parameters: [],
      triggerPhrases: [],
      urlPattern: '',
      preconditions: [],
      author: 'agent',
      createdAt: now,
      updatedAt: now,
      skillMd: '',
      steps,
      startUrl,
      score: 1,
      status: 'creating',
      totalRuns: 0,
      successCount: 0,
      source: 'user',
      instruction: '',
      configSignature: '',
    })

    // Run LLM creation in background, then update the placeholder
    try {
      const skill = await createSkillFromExecution(instruction, steps, startUrl, gatewayUrl, model)
      skill.id = placeholderId
      await store.save(skill)
    } catch {
      // On failure, remove the placeholder
      await store.delete(placeholderId)
    }
    return { id: placeholderId } as { id: string }
  }, [pendingSkillSave, model])

  const dismissSkillSave = useCallback(() => {
    setPendingSkillSave(null)
  }, [])

  return {
    messages,
    conversationId,
    conversations,
    streamingText,
    isLoading,
    toolStatuses,
    error,
    sendMessage,
    runSkill,
    stopAgent,
    newChat,
    loadConversation,
    removeConversation,
    pendingSkillSave,
    saveAsSkill,
    dismissSkillSave,
    pendingSkillParams,
    prefillParams,
    confirmSkillParams,
    cancelSkillParams,
  }
}
