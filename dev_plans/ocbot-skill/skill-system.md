# ocbot Skill System

## Overview

ocbot Skills are **Claude-compatible Agent Skills** extended for browser automation. The core specification follows [Claude's SKILL.md standard](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills) — same frontmatter format, same progressive disclosure, same trigger mechanism — but adds a browser-native execution layer (steps, self-heal, scoring) that Claude Skills don't need.

**Design principle**: An ocbot Skill IS a Claude Skill (SKILL.md + resources). It additionally HAS browser replay data (steps.json) and execution metrics.

**Positioning**: Browser Plugin Terminator — Skills replace traditional Chrome Extensions with AI-driven automation.

**Business model**: The browser is open-source, but the Skill ecosystem is closed. Official high-quality Skills are provided by ocbot; users can also create, Clone, and Fork community Skills.

---

## Compatibility with Claude Skill Spec

### What's the Same

| Aspect | Claude Skill | ocbot Skill |
|--------|-------------|-------------|
| Entry point | `SKILL.md` with YAML frontmatter | Same |
| Frontmatter fields | `name`, `description` | Same, plus `triggerPhrases` |
| Progressive disclosure | metadata → body → resources | Same (L1 → L2 → L3) |
| Resources | `scripts/`, `references/`, `assets/` | Same structure, stored in skill bundle |
| Trigger matching | Description-based semantic match | Description + triggerPhrases + URL |
| Writing style | Imperative/infinitive form | Same |

### What's Different (Browser Extensions)

| Aspect | Claude Skill | ocbot Skill |
|--------|-------------|-------------|
| Execution | LLM reads SKILL.md, uses tools | Dual-track: cached replay OR LLM |
| L3 resources | `scripts/`, loaded into LLM context | `scripts/steps.json` — machine-executable, never sent to LLM |
| Self-healing | N/A | 4-level progressive self-heal |
| Scoring | N/A | Composite health score from execution history |
| Parameters | N/A (handled by LLM) | Explicit `SkillParameter[]` with UI form |
| Auto-creation | N/A | Agent records steps → auto-save as skill |

---

## Skill Structure

```
my-skill/
├── SKILL.md              # L1+L2: frontmatter (metadata) + body (instructions)
├── scripts/
│   ├── steps.json         # L3: recorded replay steps (ocbot browser execution layer)
│   ├── executions.json    # L3: execution history, HealEvents, metrics
│   ├── evals.json         # automated test cases
│   ├── versions.json      # version snapshots (last 5)
│   └── *.py / *.sh        # Optional: utility scripts (same as Claude)
├── references/            # Optional: detailed docs (same as Claude)
└── assets/                # Optional: templates, images (same as Claude)
```

`steps.json` 放在 `scripts/` 下，因为它本质是机器可执行的脚本（JSON 格式的浏览器操作序列），与 Claude `scripts/` 的语义一致 — "执行时用到的东西"。

**Storage**: In Phase 1, all fields are stored flat in `chrome.storage.local` (single `Skill` object). The file-based structure above is the logical model and the target format for Phase 4 (marketplace distribution).

### Why Separate SKILL.md and scripts/steps.json?

- `SKILL.md` describes "what to do" — the LLM reads this during Agent Track or Level 3 self-heal
- `scripts/steps.json` describes "how to do it" — specific CDP operations the replay engine executes directly
- They evolve independently: page structure changes update steps.json via self-heal; business logic changes require editing SKILL.md

---

## SKILL.md Format

Following Claude's SKILL.md specification with ocbot extensions:

### Frontmatter

```yaml
---
name: taobao-price-tracker
description: >
  淘宝商品价格追踪。搜索指定商品，提取价格信息，监控价格变动。
  适用于已登录淘宝的浏览器会话。
triggerPhrases:
  - "淘宝价格"
  - "淘宝比价"
  - "taobao price"
  - "监控价格"
  - "商品价格追踪"
startUrl: "https://www.taobao.com"
categories:
  - E-Commerce
parameters:
  - name: keyword
    type: string
    description: "要搜索的商品关键词"
    required: true
  - name: max_price
    type: number
    description: "价格上限（可选，超过则忽略）"
    required: false
---
```

**Field details:**

| Field | Required | Source | Description |
|-------|----------|--------|-------------|
| `name` | Yes | Claude spec | Kebab-case identifier, max 60 chars |
| `description` | Yes | Claude spec | Natural language description. Should include what the skill does and when to use it |
| `triggerPhrases` | Yes | **ocbot extension** | Exact phrases users would say to trigger this skill. Used for fast text matching without LLM |
| `startUrl` | Yes | **ocbot extension** | URL where execution begins. Used for URL-based matching |
| `categories` | No | **ocbot extension** | Category tags for marketplace browsing |
| `parameters` | No | **ocbot extension** | Typed parameters with UI form support |

### Body

```markdown
# Taobao Price Tracker

## Workflow
1. Navigate to taobao.com
2. Search for the product keyword in the search bar
3. Wait for search results to load
4. Extract product names and prices from the result list
5. Filter results by max_price if provided
6. Return the top results with prices

## Preconditions
- User must be logged into Taobao in the current browser session
- Search keyword must be specific enough to return relevant results

## Success Criteria
- Search results page loads with matching products
- At least one product price is successfully extracted

## Notes
- Taobao may show different layouts for different product categories
- Price elements may include promotional prices and original prices; extract the lowest visible price
- If CAPTCHA appears, the skill will pause and notify the user
```

### Body Structure (Recommended Sections)

| Section | Purpose | Required |
|---------|---------|----------|
| `## Workflow` | Step-by-step execution flow in natural language | Yes |
| `## Preconditions` | What must be true before running (login, page state) | Recommended |
| `## Success Criteria` | How to verify the skill completed correctly | Recommended |
| `## Notes` | Edge cases, error handling, known limitations | Optional |
| `## Parameters` | Only if parameters need extra explanation beyond frontmatter | Optional |

### Writing Style

Follow Claude's SKILL.md conventions:

- **Imperative/infinitive form**: "Navigate to...", "Click the button", "Verify the result"
- **Not second person**: Avoid "you should", "you need to"
- **Concise**: Target 200-500 words for body (browser skills are shorter than dev skills)
- **Concrete**: Specific selectors, URLs, text to look for — not vague descriptions

---

## Progressive Loading

Inspired by Claude's three-level progressive disclosure:

| Level | When Loaded | Content | Token Cost |
|-------|-------------|---------|------------|
| L1 Metadata | Always (startup) | name, description, triggerPhrases, parameters, categories, startUrl, score, status | ~100/skill |
| L2 Instructions | On trigger match | SKILL.md body — workflow, preconditions, success criteria | ~200-500 |
| L3 Execution | On run | scripts/steps.json (replay steps), execution history, heal events | 0 (not sent to LLM) |

L3 is unique to ocbot — it's machine-executable replay data consumed directly by the replay engine, never by the LLM. This is a key advantage over Claude Skills where L3 resources still consume tokens.

**L1 used for**: Skill matching (fast text matching on triggerPhrases + URL hostname)
**L2 used for**: Agent Track execution, Level 3 self-heal (segment repair)
**L3 used for**: Fast Track execution, Level 1/2 self-heal

---

## Data Model

### Core Types

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

### Replay Step Types

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

### Execution & Heal Types

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

### Marketplace Extensions (for cloud/public skills)

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

## Skill Matching

### triggerPhrases: The Key Innovation

Claude Skills rely on LLM semantic matching against the description. This works for dev tools (low frequency, high tolerance for latency) but is too slow for browser automation (every user message triggers a match check).

ocbot adds `triggerPhrases` — explicit trigger strings that enable **fast text matching without LLM calls**:

```
User: "帮我查一下淘宝 iPhone 16 价格"
  │
  ▼ Phase 1: triggerPhrases scan (O(n), no LLM, <1ms)
  ├─ skill.triggerPhrases.some(phrase => userMessage.includes(phrase))
  ├─ Match found → confidence: 'strong'
  └─ No match → Phase 2
  │
  ▼ Phase 2: URL hostname match + name keywords (O(n), no LLM, <1ms)
  ├─ currentUrl hostname matches skill.startUrl hostname?
  ├─ AND user message contains name keywords (≥3 chars)?
  ├─ Match found → confidence: 'strong'
  └─ No match → Phase 3
  │
  ▼ Phase 3: LLM semantic match (optional, ~500 tokens)
  └─ Send compact skill list + user message to LLM
     └─ LLM returns {id, confidence: 'strong'|'weak'} or null
```

### triggerPhrases Generation

During `createSkillFromExecution`, the LLM generates triggerPhrases as part of skill metadata:

```
Prompt: "Based on this browser task execution, generate 3-5 trigger phrases
         that a user would say to invoke this skill. Include variations
         in language (Chinese + English), different wordings, and common
         abbreviations."

Example output:
  triggerPhrases: ["淘宝价格", "淘宝比价", "taobao price", "监控价格", "商品价格追踪"]
```

### Full Matching Priority

```
User input
  │
  ├─ [1] Explicit invocation: user selects skill from UI or says "run <skill-name>"
  │
  ├─ [2] User Skill match: triggerPhrases → URL+name → (optional) LLM semantic
  │  └─ Match → confirm with user → SkillRunner.execute()
  │
  ├─ [3] Auto-Skill match: instruction exact + configSignature exact + URL hostname
  │  └─ Match → SkillRunner.executeFastTrackOnly()
  │
  └─ [4] No match → normal Agent loop (no skill)
```

### Auto-Skill Matching Details

```typescript
// matcher.ts → matchAutoSkill() — 精确匹配
match = allSkills.find(s =>
  s.source === 'auto' &&
  s.status === 'active' &&
  s.instruction === normalized &&                  // 指令精确匹配
  s.configSignature === configSignature &&          // 模型精确匹配
  (s.steps[0]?.type === 'navigate' ||              // 首步是 navigate 或
    hostname matches s.startUrl)                    // 当前 URL hostname 匹配
)
```

归一化规则：
- `instruction` → `trim().toLowerCase()`
- `configSignature` → `"providerType:modelId"` 如 `"openai-compatible:qwen3.5-plus"`

---

## Skill Lifecycle

### Chat-Driven Creation & Editing

Skill 的创建和编辑统一通过 **chat 交互** 完成。不需要独立的表单 UI — sidepanel 的对话界面就是 skill 编辑器。

**为什么用 chat 而不是表单？**

- SKILL.md 对齐 Claude 规范后内容复杂（frontmatter + Workflow + Preconditions + triggerPhrases），表单难以覆盖
- Chat 能理解意图："把触发词加上英文版本" — 一句话改多个字段
- LLM 能分析执行历史："这个 skill 最近老失败，帮我优化" — 表单做不到
- 参数设计需要经验："搜索关键词应该做成参数" — LLM 自动识别并改 SKILL.md

### Creation Methods

| Method | User Experience | Technical Path |
|--------|----------------|----------------|
| **Save from execution** | Agent completes任务 → "Save as Skill" → LLM 在 chat 中生成 SKILL.md → 用户可继续对话调整 | 录制 steps → LLM 生成 SKILL.md → 保存 |
| **Chat creation** | 用户在 chat 中描述想要的 skill → LLM 生成 SKILL.md → 首次运行时录制 steps | 纯对话生成 SKILL.md，无 steps.json → 首次 Agent Track 执行时录制 |
| **Clone/Fork** | Browse Marketplace, clone or fork | Clone: read-only copy; Fork: independent copy，可通过 chat 编辑 |

### Creation Flow: Save from Execution

```
Agent 完成任务 → 用户点击 "Save as Skill"
  │
  ▼ Phase 1: Save placeholder immediately
  保存到 SkillStore，status: 'creating'，最小 metadata
  │
  ▼ Phase 2: LLM analysis (background)
  LLM 分析录制的 steps，生成完整 SKILL.md：
  - frontmatter: name, description, triggerPhrases, categories, parameters, startUrl
  - body: Workflow, Preconditions, Success Criteria
  │
  ▼ Phase 3: Update skill
  解析 LLM 输出 → 更新 placeholder → status: 'active'
  │
  ▼ On failure: delete placeholder
```

### Creation Flow: Chat Creation (No Prior Execution)

```
用户: "帮我创建一个 skill，追踪淘宝商品价格"
  │
  ▼ LLM 生成 SKILL.md（frontmatter + body）
  展示预览 → 用户可继续对话调整
  │
  ▼ 用户: "加一个参数，用户名"
  LLM 更新 SKILL.md → 展示 diff
  │
  ▼ 用户确认 → 保存
  此时只有 SKILL.md，没有 steps.json
  │
  ▼ 首次运行 → Agent Track（LLM 读 SKILL.md 执行）→ 录制 steps.json
  ▼ 之后运行 → Fast Track（replay steps.json）
```

### Editing Flow: Chat-Based

```
用户进入 Skill 详情 → 点击 "Edit" → 进入 chat 编辑模式
  │
  ▼ System prompt 包含:
  - 当前 SKILL.md 全文
  - 最近执行历史摘要（成功率、heal events、fragile steps）
  │
  ▼ 用户可以说:
  - "加一个参数叫 keyword"           → 更新 frontmatter.parameters
  - "触发词加上 '淘宝比价'"           → 更新 frontmatter.triggerPhrases
  - "workflow 第 3 步改成先等页面加载" → 更新 body Workflow section
  - "这个 skill 为什么老失败？帮我修" → LLM 分析 heal events + fragile steps
  │
  ▼ LLM 输出修改后的 SKILL.md → diff 预览 → 用户确认 → 保存
```

### Auto-Skill Creation (Automatic)

Auto-Skill 在 **LLM loop 完成后** 自动创建，无需用户操作：

```
LLM loop 结束
  ├─ recordedSteps.length > 0 且 userInstruction 存在
  │  └─ createAutoSkill(instruction, steps, startUrl, configSignature)
  │     └─ skillStore.saveAutoSkill(autoSkill)
  └─ 首次创建时 score=1, status='active'
```

Tool call → replay step 记录逻辑：

| Tool Call | 记录为 | 说明 |
|-----------|--------|------|
| `act({instruction})` | `{type: 'act', instruction, actions}` | instruction-based |
| `act({nodeId, method})` | `{type: 'act', instruction: description, actions}` | description 来自结果 |
| `navigate({url})` | `{type: 'navigate', url}` | — |
| `scroll({direction})` | `{type: 'scroll', direction}` | — |
| `waitForNavigation` | `{type: 'wait'}` | — |
| `fillForm({fields})` | `{type: 'fillForm', fields, actions}` | — |
| `ariaTree` / `think` / `extract` / `observe` | 对应 type | 回放时跳过 |
| `screenshot` | **不记录** | — |

### Full Lifecycle

```
Create (chat) → Edit (chat) → Run → Self-Heal → Evolve → Score → Archive/Thrive
                    ↑          ↑                                       │
                    │          └───────── Clone / Fork ────────────────┘
                    └── "帮我优化这个 skill"（chat 编辑 + 执行历史分析）
```

---

## Execution & Caching

### Two-Layer Cache Architecture

| Layer | File | Granularity | Cache Key | Purpose |
|-------|------|-------------|-----------|---------|
| **ActCache** | `lib/agent/cache.ts` | 单个 act 动作 | `SHA-256(instruction + url)` | 元素级缓存 + 5 级选择器自愈 |
| **Auto-Skill** | `lib/skills/store.ts` | 完整任务流程 | `instruction + configSignature` | 任务级缓存 + 4 级自愈 |

### Execution Priority

```
runAgentLoop(provider, messages, ...)
  │
  ├─ [1] User Skill 匹配 — matchSkill()
  │  └─ triggerPhrases + URL hostname + name keywords
  │     └─ 命中 → 询问用户确认 → SkillRunner.execute()
  │
  ├─ [2] Auto-Skill 匹配 — matchAutoSkill()
  │  └─ instruction 精确 + configSignature 精确
  │     └─ 命中 → SkillRunner.executeFastTrackOnly()
  │        ├─ ✅ 成功 → 直接返回
  │        └─ ❌ 失败 → 跌入 [3]
  │
  └─ [3] 完整 LLM Loop
     └─ 每个 turn 中的 act() 调用内部走 ActCache
        └─ 结束后保存为新的 auto-skill
```

### Dual Track Execution

```
Skill triggered (match or manual select)
  │
  ├─ Has steps?
  │   YES → Fast Track: replayAgentSteps()
  │         ├─ Success → done (0 tokens)
  │         └─ Failure → 4-level self-heal
  │                      └─ All levels fail → Agent Track
  │
  └─ NO → Agent Track: runAgentLoop() with SKILL.md as instructions
          └─ Success → record steps → save to steps.json
```

### ActCache — Action-Level Caching

```
act(instruction, provider, cache)
  │
  ├─ cache.lookup(instruction, url)
  │  ├─ Cache Hit
  │  │  ├─ selfHealFromSnapshot() — 5 级选择器修复
  │  │  │  ├─ 1. XPath 查找（最稳定的 DOM 选择器）
  │  │  │  ├─ 2. testId 匹配（data-testid）
  │  │  │  ├─ 3. clickPoint 坐标点击（绕过 DOM，仅 click 动作）
  │  │  │  ├─ 4. roleName 模糊匹配（精确 → 忽略大小写 → 子串）
  │  │  │  └─ 5. alternativeSelectors（历史成功的选择器，LRU 最多 5 个）
  │  │  ├─ ✅ Self-heal 成功 → 执行动作 → 更新缓存 → 返回
  │  │  └─ ❌ Self-heal 失败 → 调 LLM 重新推理 → 如果成功则更新缓存
  │  └─ Cache Miss
  │     └─ 调 LLM 推理动作 → 执行 → 成功则存入缓存（含 xpath + clickPoint）
  │
  └─ 返回 ActResult { success, actions, cacheHit, selfHealed }
```

### Replay Flow (Auto-Skill / User Skill)

```
SkillRunner.execute(skill, parameters)
  └─ runFastTrack()
     │
     ├─ substituteStepParams() — %paramName% 参数替换
     ├─ 脆弱步骤预检（如果 fragileSteps 已知）
     │  └─ 对每个脆弱步骤检查 xpath 是否存在，不存在则提前 L2 修复
     │
     └─ replayAgentSteps(steps, executeTool, callbacks, signal, healFn)
        │
        ├─ 对每个步骤：
        │  ├─ ariaTree/think/extract/observe → 跳过
        │  ├─ navigate → executeTool('navigate', {url})
        │  ├─ act → executeTool('act', {instruction})
        │  │  └─ 内部走 act() → ActCache lookup → self-heal → 或 LLM 推理
        │  ├─ 检查结果 success === false?
        │  │  ├─ 是 → L2 healFn → healStep()
        │  │  │     ├─ ✅ 成功 → 继续
        │  │  │     └─ ❌ 失败 → 回放终止
        │  │  └─ 否 → 继续
        │  └─ 检查 selfHealed → 记录 heal event
        │
        └─ 回放终止:
           ├─ ✅ 全部成功 → 返回 success
           └─ ❌ 某步失败 → L3 healSegment()
              ├─ ✅ 成功 → evolveSkill
              └─ ❌ 失败 → 返回 failure → loop.ts 跌入完整 LLM loop
```

### Capacity Limits

| Resource | Limit | Eviction |
|----------|-------|----------|
| ActCache entries | 500 | LRU by `updatedAt` |
| Auto-Skills | 50 (separate pool) | LRU by `updatedAt` |
| Total Skills | 200 | LRU by `updatedAt` |
| Executions per Skill | 50 | FIFO |

### Known Issue: nodeId vs instruction Path Split

```
                    写入 ActCache?   可复用?
act({nodeId, method})    ❌             ❌    ← LLM 倾向使用（更快）
act({instruction})       ✅             ✅    ← 缓存友好（但多一轮 LLM 推理）
```

改进方向：
1. ✅ 已实现 — `clickPoint` 坐标兜底
2. nodeId 调用也写入 ActCache（用 `description` 作为 instruction）
3. Auto-skill 回放容错 — L3 segment repair 从当前页面继续
4. 部分回放利用 — 即使回放失败，已成功步骤不浪费

---

## Self-Heal & Evolution

Skill 的核心价值不是"一次录制，永远回放"，而是 **执行即训练** — 每次运行都是一次进化机会。

### 4-Level Progressive Self-Heal

```
Skill 执行开始
     │
     ▼
┌─────────────────────────────────────┐
│  Level 0: 直接回放 (Fast Track)      │  成本: 0 token, ~100ms/step
│  replay cached steps as-is          │
└──────────┬──────────────────────────┘
           │ step 失败
           ▼
┌─────────────────────────────────────┐
│  Level 1: 元素级自愈                  │  成本: 0 token, ~200ms
│  re-snapshot + fuzzyMatch            │
│  同一个 instruction，只是 selector 变了│
│  成功后回写 steps.json               │
└──────────┬──────────────────────────┘
           │ fuzzy match 全部失败
           ▼
┌─────────────────────────────────────┐
│  Level 2: 步骤级重推理               │  成本: ~500 token, ~2s
│  只对失败的这一步调 LLM re-inference  │
│  保留前后步骤不变                     │
│  成功后回写该步骤到 steps.json        │
└──────────┬──────────────────────────┘
           │ 重推理也失败（页面流程变了）
           ▼
┌─────────────────────────────────────┐
│  Level 3: 段落级重规划               │  成本: ~2000 token, ~5s
│  从失败步骤开始，用 SKILL.md 的       │
│  instructions 引导 LLM 重新规划      │
│  后续步骤（不是从头开始）              │
│  成功后替换 failedIndex 之后的 steps  │
└──────────┬──────────────────────────┘
           │ 段落重规划也失败
           ▼
┌─────────────────────────────────────┐
│  Level 4: 全量重执行 (Agent Track)   │  成本: 全量 token, 完整时间
│  SKILL.md instructions + 当前页面    │
│  状态，Agent 从头推理                 │
│  成功后用完整新轨迹替换 steps.json    │
└─────────────────────────────────────┘
```

### Level 2 — 步骤级重推理

```typescript
async function healStep(
  failedStep: AgentReplayStep,
  pageSnapshot: Snapshot,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<AgentReplayStep | null> {
  const result = await inferActions(failedStep.instruction, pageSnapshot, provider, signal)
  if (result.success) {
    return { ...failedStep, actions: result.actions }
  }
  return null  // 升级到 Level 3
}
```

### Level 3 — 段落级重规划

SKILL.md（L2 语义层）和 steps.json（L3 执行层）分离的核心价值所在——L3 坏了，L2 能指导修复。

**结构化 SKILL.md 对 L3 的提升**：遵循 Claude SKILL.md 规范后，SKILL.md 包含标准化的 `## Workflow`、`## Preconditions`、`## Success Criteria` sections，LLM 在重规划时能更精确地理解"已完成哪些步骤"和"接下来该做什么"。

```typescript
async function healSegment(
  steps: AgentReplayStep[],
  failedIndex: number,
  skillMd: string,          // SKILL.md（含结构化 Workflow section）
  pageSnapshot: Snapshot,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<AgentReplayStep[]> {
  // LLM 产出新的步骤序列，替换 failedIndex 之后的所有步骤
}
```

### Evolution Logic

```
每次执行完成后:
│
├─ success && healEvents.length === 0
│   → 完美执行，不需要进化
│
├─ success && healEvents 中仅有 resolved 的 Level 1/2
│   → 微进化：用 healEvent.newActions 回写 steps.json
│   → version 不变，只是 steps 更新（cache refresh）
│
├─ success && healEvents 中有 Level 3/4
│   → 大进化：用本次完整执行轨迹替换 steps.json
│   → version + 1
│   → 可选：LLM 分析新旧 steps 差异，更新 SKILL.md
│
├─ failed && userFeedback === 'bad'
│   → 标记为 degraded
│   → 触发诊断：分析最近 N 次执行的 healEvents → 找脆弱点
│
└─ failed 但用户没反馈
    → 静默记录，等累积到阈值再触发进化
```

---

## Scoring & Fragility

### Scoring Formula

```
score = recentSuccessRate * 0.35       // 最近 20 次执行的成功率
      + stability * 0.25               // 1 - (需要 L2+ 自愈的执行占比)
      + efficiency * 0.15              // 1 - (avgHealLevel / 4)
      + userSatisfaction * 0.15        // thumbsUp / (thumbsUp + thumbsDown)
      + usageFrequency * 0.10          // 归一化的使用频率

stability = 1 - (executions_needing_L2_plus / total_recent_executions)
efficiency = 1 - (avg_heal_level_when_healed / 4)
```

一个每次都成功但每次都要 Level 3 自愈的 Skill，score 不会很高——虽然能用但很脆弱。

### Status Transitions

| Condition | Action |
|-----------|--------|
| `score ≥ 0.6` | `active` — 正常使用 |
| `0.3 ≤ score < 0.6` | `degraded` — UI 显示警告，不再自动匹配 |
| `score < 0.3` 且 `totalRuns > 10` | `archived` — 不再推荐 |
| `degraded` 持续 30 天无改善 | 自动归档 |
| 用户手动"修复" degraded skill | 触发 Agent Track 执行，用新 steps 刷新 |

### Fragility Detection

```typescript
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

如果一个 step 频繁需要 Level 2+ 自愈（healCount / recentExecutions > 0.5）：

```
收集该步骤的所有 healEvent
  │
  ├─ 大多是 Level 1 修复 → 增强 fuzzy match，记录 alternativeSelectors
  ├─ 大多是 Level 2 修复 → instruction 不够精确，LLM 生成更稳定的 instruction
  └─ 大多是 Level 3/4 修复 → 页面大改，通知用户重新录制，标记 degraded
```

### Clone/Fork Evolution Graph

```
linkedin-outreach v1 (official, score=0.85)
  ├── fork: linkedin-outreach-cn (user_A, score=0.92)   ← 中文适配版
  │     └── fork: linkedin-outreach-cn-v2 (user_B)
  └── fork: linkedin-connect-only (user_C, score=0.78)  ← 精简版
```

`sourceSkillId` 记录 fork 来源。Fork 版本 score 持续高于原版时，Marketplace 自然将其排在更前面。

---

## Quality Engineering

参考 [Claude skill-creator 的工程化实践](../claude-skill-creator-analysis.md)，Skill 需要超越"录制 → 回放"，具备完整的质量保障体系。

### Automated Evals

Eval 定义存储在 `scripts/evals.json`，每个 eval 是 input → expect 断言：

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
```

**执行流程**:

```
用户点击 "Run Evals" 或发布前自动运行
  │
  ▼ 对每个 eval:
  ├─ 打开新标签页（隔离环境）
  ├─ SkillRunner.execute(skill, eval.input.parameters)
  ├─ 执行完毕后，逐条检查 expect 断言
  ├─ 记录: pass/fail, 耗时, token 消耗, heal events
  └─ 关闭标签页
  │
  ▼ 汇总结果:
  Eval Report:
    ✅ eval-1: 搜索商品应显示结果 (3.2s, 0 tokens, fast track)
    ❌ eval-2: 空搜索应显示提示 (failed: text "请输入" not found)
  Pass rate: 1/2 (50%)
```

通过 chat 生成（"帮这个 skill 加几个测试用例"），与 skill 创建/编辑体验一致。

### Skill Doctor（发布前诊断）

不实际执行操作，只做静态检查：

```
Diagnose:
  │
  ▼ 1. SKILL.md 结构检查
  ├─ frontmatter 完整性：name, description, triggerPhrases 是否存在
  ├─ body 结构：是否包含 ## Workflow section
  └─ triggerPhrases 质量：是否 ≥ 3 个，是否包含多语言变体
  │
  ▼ 2. Selector 预检
  ├─ 导航到 startUrl
  ├─ 遍历 scripts/steps.json 每个 step 的 xpath/roleName
  └─ 标记不可解析的步骤 → 建议修复
  │
  ▼ 3. Self-Heal 验证（可选）
  ├─ 故意移除 xpath，验证 L1 自愈能否恢复
  └─ 评估对 DOM 变化的容忍度
```

### Version Comparison & Rollback

- evolve (version+1) 时保存前一版本快照到 `scripts/versions.json`（最近 5 个版本）
- 展示版本间指标对比：成功率、速度、token 消耗

**自动回滚机制**：

```
version+1 后的最近 5 次执行:
  │
  ├─ 新版本成功率 < 旧版本成功率 - 20%
  │   → 自动回滚到上一版本
  │   → 通知用户 "Skill v{N} 表现不佳，已回滚到 v{N-1}"
  │
  └─ 新版本成功率 ≥ 旧版本 → 保持新版本
```

### Marketplace 可信度（Phase 4）

Skill 卡片展示：Reliability %、Avg Cost、Verified 徽章。

**Verified 条件**：eval pass rate ≥ 90% + score ≥ 0.8 + totalRuns ≥ 50 + 无 degraded 历史（最近 30 天）。

---

## Open-Source vs Closed-Source Skills

Skill 分为两种分发模式：**开源（Open-Source）** 和 **闭源（Closed-Source）**。

### 对比

| | Open-Source | Closed-Source |
|---|---|---|
| **SKILL.md** | 明文可读 | 加密，仅 metadata 可见 |
| **scripts/steps.json** | 明文可读 | 加密 |
| **scripts/references/assets** | 明文可读 | 加密 |
| **分发方式** | GitHub repo / zip / URL 导入 | Marketplace 加密分发 |
| **Fork** | 自由 fork，完整源码 | 不可 fork（看不到源码） |
| **Clone** | 可 clone（跟随上游更新） | 可 clone（跟随上游更新） |
| **社区贡献** | PR / fork 改进 / issue 反馈 | 只能反馈给作者 |
| **商业模式** | 免费，靠声誉和生态 | 付费 / 订阅 / 免费增值 |
| **转换** | 不可转闭源（已公开） | 作者可选择开源（单向） |

### Open-Source Skill

**格式**：标准文件目录，可直接托管在 GitHub：

```
my-skill/
├── SKILL.md              # 明文，任何人可读
├── scripts/
│   ├── steps.json         # 明文，可学习和改进
│   └── *.py / *.sh        # 明文
├── references/            # 明文
└── assets/                # 明文
```

**导入方式**：
- **GitHub URL**: 粘贴 repo URL → 一键导入
- **Zip 上传**: 拖拽 zip 文件到 Skills 页面
- **Marketplace**: 开源 skill 也可发布到 marketplace，标记为 "Open Source"

**导出方式**：
- Skill 详情页 → "Export" → 生成 zip 文件
- 或直接 "Push to GitHub"（需要 GitHub 授权）

### Closed-Source Skill

**格式**：加密 bundle：

```
my-skill.ocskill (encrypted bundle)
├── manifest.json          # 明文：name, description, parameters, categories, triggerPhrases
└── payload.enc            # 加密：SKILL.md body + scripts/steps.json + resources
```

**Clone 流程（闭源唯一的获取方式）**：
```
用户浏览闭源 Skill → "Clone" (或 "购买" 后 Clone)
  ▼ 下载加密 bundle → 本地解密执行
  ▼ 只能运行，不能查看或编辑 SKILL.md/steps.json
  ▼ 跟随上游更新：作者发布新版本 → 自动同步
  ▼ self-heal 产生的进化数据存在本地（不回写上游）
```

---

## Encryption & Cloud Storage (Phase 3+)

核心原则：**密钥永远不出内核层，JS 层只传密文进出，服务端永远不持有明文。**

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chromium 内核层 (C++)                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  OcbotCryptoService (Mojo IPC)                    │  │
│  │  ● Key Derivation (HKDF-SHA256)                   │  │
│  │  ● Encrypt / Decrypt (AES-256-GCM)               │  │
│  │  ● Master Key ←→ OS Keychain (Ocbot Safe Storage) │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │ chrome.ocbot.crypto API           │
├──────────────────────┼──────────────────────────────────┤
│  ┌───────────────────▼───────────────────────────────┐  │
│  │              Extension 层 (TypeScript)              │  │
│  │  SkillStore ──► encrypt ──► Cloud API ──► Server   │  │
│  │  SkillStore ◄── decrypt ◄── Cloud API ◄── Server   │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    Cloud 层                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Auth Service │  │ Skill Store  │  │ Marketplace   │  │
│  │ (JWT/OAuth)  │  │ (encrypted)  │  │ (metadata)    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Why Kernel-Level Crypto

| Dimension | Web Crypto (JS) | Kernel (C++) |
|-----------|-----------------|-------------|
| Master Key storage | JS heap, readable by devtools | OS Keychain, process-isolated |
| Key lifecycle | GC timing uncertain | Manual `memset(0)` |
| Attack surface | Malicious extensions, console | Mojo IPC with permission check |
| Hardware support | None | macOS: Secure Enclave; Windows: TPM |

### Key Hierarchy

```
OS Keychain ("Ocbot Safe Storage")
  └─ Master Key (AES-256)           ← 设备级，永不离开内核
       │ HKDF-SHA256(master_key, context)
       ├─ SK_skill_1                 ← context: "skill:<skillId>"
       ├─ SK_skill_2
       └─ SK_provider_keys           ← context: "provider:<providerId>"
```

### Mojo Interface

```mojom
interface OcbotCryptoService {
  Initialize() => (bool success);
  Encrypt(string context, array<uint8> plaintext) => (array<uint8> ciphertext, array<uint8> nonce);
  Decrypt(string context, array<uint8> ciphertext, array<uint8> nonce) => (array<uint8>? plaintext);
  ExportWrappedKey(string passphrase) => (array<uint8> wrapped_key);
  ImportWrappedKey(string passphrase, array<uint8> wrapped_key) => (bool success);
};
```

### Private vs Public Skill Encryption

**Private Skill** — 全加密，服务端只看到 opaque blob + timestamps：

```json
{
  "id": "skill_abc123",
  "owner_id": "user_xyz",
  "visibility": "private",
  "blob": "<base64 encrypted everything>",
  "blob_nonce": "<base64>",
  "updated_at": 1740700800
}
```

**Public Skill (Marketplace)** — metadata 明文（供发现），content 加密（保护 IP）：

```json
{
  "id": "skill_def456",
  "visibility": "public",
  "metadata": { "name": "...", "description": "...", "categories": [...] },
  "encrypted_content": "<base64>",
  "distribution_blob": "<base64>"
}
```

### Clone Key Transformation

```
作者发布: plaintext → encrypt(author_SK) → encrypted_content
          plaintext → encrypt(dist_key)  → distribution_blob

用户 Clone: download distribution_blob → decrypt(dist_key) → re-encrypt(user_SK) → 本地密文
```

### Cross-Device Sync

```
设备 A: passphrase → PBKDF2 → wrapping_key → AES-KW(master_key) → wrapped_blob → QR/text
设备 B: paste wrapped_blob + passphrase → 解包 → 存入 Keychain → 云端数据即可解密
```

### Cloud API

```
POST   /api/skills                  上传 (encrypted blob)
GET    /api/skills/:id              下载
PUT    /api/skills/:id              更新
DELETE /api/skills/:id              删除
GET    /api/skills?q=...&cat=...    搜索 (public skill metadata)
POST   /api/skills/:id/clone        Clone
POST   /api/skills/:id/fork         Fork (只返回参数骨架)
POST   /api/skills/:id/metrics      上报执行指标
```

### Bonus: Encrypt Existing Sensitive Data

有了 `chrome.ocbot.crypto`，可统一加密现有明文数据（`LlmProvider.apiKey`、`ChannelConfig.botToken`）：

```typescript
const { ciphertext, nonce } = await chrome.ocbot.crypto.encrypt(
  `provider:${provider.id}`,
  new TextEncoder().encode(provider.apiKey)
)
// 明文不落盘，只存密文
```

---

## Skill Categories

| Category | Typical Use Cases |
|----------|-------------------|
| Search | Search engines, information retrieval |
| E-Commerce | Price monitoring, product scraping, auto-checkout |
| Financial | Financial data, stock monitoring |
| News | News aggregation, content monitoring |
| Social Media | LinkedIn / Twitter / Instagram automation |
| Travel | Flight & hotel search, price tracking |
| Lead Generation | Lead scraping, email / phone lookup |
| Jobs | Job search, auto-apply |
| Automation | General automation, scheduled tasks, daily check-ins |
| Developer | API calls, data validation, testing |
| Integration | CRM / Sheets / Notion data sync |

---

## Relationship to Claude Skills

```
Claude Skill (specification)
├── SKILL.md (frontmatter + body)        ← ocbot follows this exactly
├── scripts/                             ← ocbot supports (stored in bundle)
├── references/                          ← ocbot supports (stored in bundle)
└── assets/                              ← ocbot supports (stored in bundle)

ocbot Skill (superset)
├── Everything above
├── license: open-source | closed-source  ← distribution model
├── triggerPhrases[]                      ← fast matching without LLM
├── startUrl                             ← URL-based matching
├── parameters: SkillParameter[]          ← typed params with UI form
├── scripts/steps.json                   ← machine-executable replay (L3)
├── scripts/executions.json              ← execution history + metrics
├── scripts/evals.json                   ← automated test cases
├── scripts/versions.json                ← version snapshots
├── score / status / fragileSteps         ← health tracking
├── 4-level self-heal                    ← automatic repair
└── E2EE encryption (closed-source)      ← kernel-level crypto
```

### Interoperability

**Import from open-source**:
- GitHub URL / zip → 解析 SKILL.md + steps.json + resources → 保存到本地 SkillStore
- 如果只有 SKILL.md（Claude Skill 格式）→ 无 steps.json → 首次 Agent Track 执行时录制

**Export to open-source**:
- 开源 skill → 导出为 zip 或 push to GitHub
- 闭源 skill → 作者可选择 "Open Source" → license 改为 open-source → 解密内容 → 导出

**Claude Skill 兼容**:
- 纯 Claude Skill（只有 SKILL.md + scripts/）→ 导入后通过 Agent Track 执行
- 执行录制自动积累 steps.json → 逐步获得 Fast Track 能力

---

## Code Integration Points

```
现有代码                              整合方式
────────────────────────────         ─────────────────────────────
loop.ts: replay 失败后               插入 Level 2/3 自愈，再失败才 Level 4
act.ts: selfHealFromSnapshot 后      增加 cache.update() 回写
act.ts: inferActions 成功后          记录 xpath 到 ActionStep
cache.ts: fuzzyMatchByRoleName       增加 xpath 优先匹配 + alternativeSelectors
agentCache.ts: toolCallToReplayStep  修复 actions 存空数组的 bug
agentCache.ts: replayAgentSteps      失败时记录 HealEvent 而非直接放弃
snapshot.ts: capturePageSnapshot     扩展为 hybrid snapshot（DOM + AXTree）
```

---

## References

- [skill-dev-plan.md](./skill-dev-plan.md) — Development roadmap and phase plan
- [claude-skill-creator-analysis.md](../claude-skill-creator-analysis.md) — Claude skill-creator evals/benchmarks analysis
- [Claude Skills Documentation](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills)
- [Agent Skills Open Standard](https://agentskills.io)
- Stagehand source: `/stagehand/packages/core/lib/v3/` — ActCache, AgentCache, self-heal reference
