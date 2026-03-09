// lib/skills/types.ts
import type { AgentReplayStep, HealEvent } from '@/lib/agent/agentCache'

export interface SkillPrecondition {
  type: 'element_visible' | 'url_contains' | 'page_title_contains'
  selector?: string       // CSS selector (for element_visible)
  value?: string          // substring (for url_contains / page_title_contains)
  description: string     // human-readable description
}

export interface SkillParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select'
  description: string
  required: boolean
  default?: string | number | boolean
  options?: string[] // for 'select' type
}

export interface Skill {
  id: string
  name: string
  description: string
  version: number
  categories: string[]
  parameters: SkillParameter[]
  triggerPhrases: string[]           // 3-5 trigger phrases for fast text matching
  urlPattern: string                 // URL scope: '*', 'taobao.com', 'taobao.com/order', etc.
  preconditions: SkillPrecondition[] // execution preconditions (default: [])

  author: string
  sourceSkillId?: string
  createdAt: number
  updatedAt: number

  skillMd: string
  steps: AgentReplayStep[]
  startUrl: string

  score: number
  status: 'active' | 'degraded' | 'archived' | 'creating'
  totalRuns: number
  successCount: number
  fragileSteps?: number[]

  source: 'auto' | 'user'
  instruction: string          // normalized instruction for auto-skill matching; '' for user skills
  configSignature: string      // 'provider:model' for auto-skills; '' for user skills
}

export interface SkillExecution {
  id: string
  skillId: string
  skillVersion: number
  timestamp: number
  track: 'fast' | 'agent' | 'hybrid'
  healEvents: HealEvent[]
  totalSteps: number
  completedSteps: number
  success: boolean
  userFeedback?: 'good' | 'bad'
  url: string
  parameters: Record<string, string>
  durationMs: number
  tokenUsage?: number            // total token usage for this execution
  primitiveRatio?: number   // primitive steps / total steps (0-1)
}

export interface SkillRunCallbacks {
  onStepStart: (index: number, step: AgentReplayStep) => void
  onStepEnd: (index: number, step: AgentReplayStep, result: string) => void
  onTrackSwitch: (from: 'fast' | 'agent', to: 'fast' | 'agent') => void
  onHeal: (event: HealEvent) => void
  onTextDelta: (text: string) => void
  // Agent-track callbacks (forwarded to UI when agent track runs)
  onToolCallStart?: (id: string, name: string, args?: string) => void
  onToolCallEnd?: (id: string, name: string, result: string) => void
  onAssistantMessage?: (content: string, toolCalls: { id: string; name: string; arguments: string }[]) => void
  onToolMessage?: (toolCallId: string, name: string, result: string) => void
}

export interface SkillRunResult {
  success: boolean
  track: 'fast' | 'agent' | 'hybrid'
  healEvents: HealEvent[]
  completedSteps: number
  totalSteps: number
  durationMs: number
  updatedSteps?: AgentReplayStep[]
  executedSteps?: AgentReplayStep[]  // steps actually executed (for agent-track fallback context)
}

export interface SkillMatch {
  skill: Skill
  confidence: 'strong' | 'weak'
  matchDepth: number                 // 0 = universal '*', higher = more specific
  extractedParams?: Record<string, string>
}
