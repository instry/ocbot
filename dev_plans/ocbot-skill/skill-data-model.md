# Skill Data Model

All TypeScript interfaces for the ocbot Skill system.

Parent document: [skill-system.md](./skill-system.md)

---

## Core Types

```typescript
interface Skill {
  id: string
  name: string                      // from SKILL.md frontmatter
  description: string               // from SKILL.md frontmatter
  version: number
  categories: string[]              // from SKILL.md frontmatter
  parameters: SkillParameter[]      // from SKILL.md frontmatter
  triggerPhrases: string[]           // from SKILL.md frontmatter

  // Creation
  author: string                    // user ID or "official"
  sourceSkillId?: string            // if forked, points to the original
  createdAt: number
  updatedAt: number

  // Content (L2 + L3)
  skillMd: string                   // SKILL.md full content (frontmatter + body)
  steps: AgentReplayStep[]          // recorded execution steps (steps.json)
  startUrl: string                  // URL where execution begins

  // Auto-skill fields
  source: 'auto' | 'user'          // 'auto' = recorded from execution, 'user' = manually saved
  instruction: string               // normalized user instruction (auto-skill matching key)
  configSignature: string           // "provider:model" (auto-skill matching key)

  // Metrics (computed from executions)
  score: number                     // 0-1, composite score
  status: 'active' | 'degraded' | 'archived' | 'creating'
  totalRuns: number
  successCount: number
  fragileSteps?: number[]           // step indices that frequently need healing

  // Distribution
  license: 'open-source' | 'closed-source'
  repositoryUrl?: string            // GitHub URL (open-source only)
  encryptedPayload?: string         // encrypted bundle (closed-source only)
  distributionKeyId?: string        // key for decryption (closed-source only)

  // Display
  iconUrl?: string
  official?: boolean
}

interface SkillParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select'
  description: string
  required: boolean
  default?: string | number | boolean
  options?: string[]                // for 'select' type
}
```

---

## Replay Step Types

```typescript
type AgentReplayStep =
  | { type: 'act'; instruction: string; actions: ActionStep[] }
  | { type: 'fillForm'; fields: FormField[]; actions: ActionStep[] }
  | { type: 'navigate'; url: string }
  | { type: 'scroll'; direction: string }
  | { type: 'wait' }
  | { type: 'ariaTree' | 'think' | 'extract' | 'observe' }  // 回放时跳过

interface ActionStep {
  method: 'click' | 'type' | 'select' | 'press'
  backendNodeId: number             // CDP node ID (changes every page load)
  xpath?: string                     // absolute XPath (stable across sessions)
  roleName: string                   // "role:name" e.g. "link:已买到的宝贝"
  className?: string                 // CSS class
  testId?: string                    // data-testid
  alternativeSelectors?: AlternativeSelector[]  // historically successful selectors
  clickPoint?: { x: number; y: number }         // cached coordinates for click fallback
  args?: string[]
  description: string
}
```

---

## Execution & Heal Types

```typescript
interface SkillExecution {
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
}

interface HealEvent {
  stepIndex: number
  level: 0 | 1 | 2 | 3 | 4
  reason: string                     // "selector_not_found" | "element_gone" | "page_changed"
  resolved: boolean
  newActions?: ActionStep[]
  tokenCost: number
  durationMs: number
}

interface SkillVersion {
  version: number
  steps: AgentReplayStep[]
  skillMd: string
  createdAt: number
  reason: string                     // "evolve_l3" | "user_edit" | "rollback"
  metrics: {
    executions: number
    successRate: number
    avgDurationMs: number
    avgTokenCost: number
  }
}
```

---

## Quality Engineering Types

```typescript
interface SkillEval {
  id: string
  name: string
  input: {
    parameters: Record<string, string>
    startUrl?: string
  }
  expect: EvalAssertion[]
}

type EvalAssertion =
  | { type: 'url_contains'; value: string }
  | { type: 'url_matches'; pattern: string }
  | { type: 'element_exists'; selector: string }
  | { type: 'element_not_exists'; selector: string }
  | { type: 'text_visible'; value: string }
  | { type: 'element_count_gte'; selector: string; count: number }

interface StepFragility {
  stepIndex: number
  instruction: string
  healCount: number              // 被自愈的次数
  healSuccessRate: number
  avgHealLevel: number           // 越高越脆弱
  lastHealAt: number
  alternativeSelectors: string[]
}
```

---

## Marketplace Extensions

```typescript
interface SkillMarketplace extends Skill {
  rating: number                    // 1-5 stars
  reviewCount: number
  cloneCount: number
  forkCount: number
  longDescription: string           // Markdown, for detail page
  screenshots: string[]
  changelog: ChangelogEntry[]
  compatibleSites: string[]         // e.g. ["linkedin.com"]
}
```

---

## Action Primitives

```typescript
interface ActionPrimitive {
  id: string
  name: string                    // "download-file"
  description: string             // "Download a file (PDF, CSV, etc.) from current page"
  stability: number               // 0-100
  parameters: PrimitiveParam[]    // [{ name: "selector", type: "string", optional: true }]
  triggerPatterns: string[]        // ["download", "下载", "save file"]
  source: 'system' | 'community' // 系统内置 or 挖掘产生
  execute(page: Page, params: Record<string, string>): Promise<ActionResult>
}
```
