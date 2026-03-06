# Skill Execution

Matching, lifecycle (creation/editing), and execution engine.

Parent document: [skill-system.md](./skill-system.md)

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

### Creation Quality Standards

参考 [Claude skill-creator](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills) 的 6 步创建流程（理解→规划→初始化→编辑→打包→迭代），ocbot 在自动化创建中应体现同等的工程严谨度。

**skill-creator 的核心思想**：Skill 不是简单的录制回放，而是需要 **理解 → 规划 → 结构化 → 迭代** 的工程化产物。关键借鉴：

| skill-creator 步骤 | ocbot 对应实现 |
|---------------------|---------------|
| **Step 1: 理解** — 明确 skill 的使用场景和触发方式 | LLM 分析录制的 steps，生成 triggerPhrases（多语言、不同说法） |
| **Step 2: 规划** — 识别可复用的 scripts/references/assets | LLM 识别哪些值应参数化、哪些步骤可能脆弱、成功标准是什么 |
| **Step 3: 初始化** — 标准化骨架 | 输出结构化 SKILL.md（frontmatter + Workflow + Preconditions + Success Criteria） |
| **Step 4: 编辑** — 完善内容 | Chat-based editing，用户可对话调整 |
| **Step 5: 打包** — 验证 + 分发 | Phase 4 Marketplace 发布前诊断（Skill Doctor） |
| **Step 6: 迭代** — test → observe → improve | 执行即训练 + 自愈回写 + chat 编辑优化 |

**元数据质量要求**（对齐 skill-creator）：

- **description**: 不只是 "one-sentence summary"，要明确 **what it does + when to use it**。description 直接决定 LLM 语义匹配的准确度
- **triggerPhrases**: 3-5 个，覆盖中英文、不同说法、常见缩写。这是 ocbot 超越 Claude skill 匹配速度的关键
- **parameters**: LLM 应主动识别可参数化的值（搜索词、用户名、URL、数量等），而非等用户指定
- **Workflow section**: 用祈使句（"Navigate to..."），具体到 URL、selector、要查找的文本，不写模糊描述

**Progressive Disclosure 在创建中的体现**：

skill-creator 强调三级加载（metadata → SKILL.md body → bundled resources）。ocbot 创建时同样遵循：
- L1 metadata（name, description, triggerPhrases）必须精准 — 这决定匹配质量
- L2 SKILL.md body 结构化 — 这决定 Agent Track 和 L3 自愈的质量
- L3 steps.json 由执行自动生成 — 不需要人工编写

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
