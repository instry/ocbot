# ocbot Skill System

## Overview

ocbot Skills are **Claude-compatible Agent Skills** extended for browser automation. The core specification follows [Claude's SKILL.md standard](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills) — same frontmatter format, same progressive disclosure, same trigger mechanism — but adds a browser-native execution layer (steps, self-heal, scoring) that Claude Skills don't need.

**Design principle**: An ocbot Skill IS a Claude Skill (SKILL.md + resources). It additionally HAS browser replay data (steps.json) and execution metrics.

**Positioning**: Browser Plugin Terminator — Skills replace traditional Chrome Extensions with AI-driven automation.

**Business model**: The browser is open-source, but the Skill ecosystem is closed. Official high-quality Skills are provided by ocbot; users can also create, Clone, and Fork community Skills.

---

## Core Goals & Principles

### 稳 > 省 > 快

| 优先级 | 目标 | 含义 |
|--------|------|------|
| **1. 稳** | 把事情搞定，符合用户期望 | 不稳的话省和快毫无意义——做错了还得重来 |
| **2. 省** | 省 token | 少调 LLM = 省钱 |
| **3. 快** | 省时间 | 稳了之后，省和快往往是同一件事 |

每一层设计都服务于这三个目标：

```
                        稳          省          快
Primitive 硬编码         ✓✓✓        ✓✓✓        ✓✓✓    ← 最理想
缓存回放 (Fast Track)    ✓✓         ✓✓✓        ✓✓✓
Self-heal L1 (fuzzy)    ✓✓         ✓✓✓        ✓✓
Self-heal L2 (单步LLM)  ✓✓         ✓✓         ✓✓
Self-heal L3 (段落LLM)  ✓          ✓          ✓
Agent Track (全量LLM)   ✓          ✗          ✗      ← 最后手段
```

**ocbot 的核心优势不在首次执行，而在重复执行**——同样的任务跑第 2 次、第 10 次、第 100 次时，token 趋近于零，速度趋近于纯 RPA，但稳定性远超传统 RPA（因为有 self-heal）。

### Progressive Disclosure

**永远从最小成本开始，按需升级，绝不预付。** 借鉴 [Agent Skills 规范](https://agentskills.io) 的 Progressive Disclosure 思想，这一原则贯穿 ocbot Skill 系统的每一层设计：

| 场景 | Level 1 (cheapest) | Level 2 | Level 3 (most expensive) |
|------|-------|---------|---------|
| **Skill 加载** | metadata ~100 tokens | SKILL.md body ~500 tokens | steps.json 0 tokens (不发 LLM) |
| **Skill 匹配** | triggerPhrases 文本匹配 <1ms | URL + name 匹配 <1ms | LLM 语义匹配 ~500 tokens |
| **执行** | 缓存回放 0 tokens | self-heal L1/L2 0~500 tokens | Agent Track full tokens |
| **Primitive** | 硬编码（确定性） | 模式规则匹配 | 涌现（数据驱动） |
| **LLM 上下文** | 当前页面 + step instruction | + SKILL.md Workflow | + 完整执行历史 |
| **页面理解** | 可视区域 AXTree ~100 元素 | 完整 AXTree ~500 元素 | Hybrid DOM + AXTree |
| **参数收集** | 从用户消息自动提取 | 缺失必填参数 → 弹表单 | 执行中追问 |

Skill 加载的三级加载详述：

| Level | When Loaded | Content | Token Cost |
|-------|-------------|---------|------------|
| L1 Metadata | Always (startup) | name, description, triggerPhrases, parameters, categories, startUrl, score, status | ~100/skill |
| L2 Instructions | On trigger match | SKILL.md body — workflow, preconditions, success criteria | ~200-500 |
| L3 Execution | On run | scripts/steps.json (replay steps), execution history, heal events | 0 (not sent to LLM) |

L3 is unique to ocbot — it's machine-executable replay data consumed directly by the replay engine, never by the LLM. This is a key advantage over Claude Skills where L3 resources still consume tokens.

- **L1 used for**: Skill matching (fast text matching on triggerPhrases + URL hostname)
- **L2 used for**: Agent Track execution, Level 3 self-heal (segment repair)
- **L3 used for**: Fast Track execution, Level 1/2 self-heal

### Benchmark 体系

**度量指标**：

| 目标 | 指标 | 计算方式 |
|------|------|---------|
| **稳** | Task Success Rate | 成功次数 / 总执行次数 |
| **稳** | First-Attempt Success Rate | 无需任何自愈即成功的比例 |
| **稳** | Self-Heal Recovery Rate | 自愈成功次数 / 自愈触发次数 |
| **省** | Tokens per Task | 完成一次任务的总 token 消耗 |
| **省** | Primitive Ratio | primitive steps / total steps（越高越省） |
| **省** | Cache Hit Rate | 缓存命中次数 / 总 act 调用次数 |
| **快** | Time to Complete | 从任务开始到完成的总时间 |
| **快** | LLM Latency Ratio | 等待 LLM 的时间 / 总时间（越低越快） |

**竞品对比基准**：

```
                    稳(成功率)   省(tokens/task)   快(秒/task)
─────────────────────────────────────────────────────────────
人工操作              99%          0                60s
传统 RPA (UiPath)     70%*         0                5s
纯 LLM Agent          80%          ~5000            30s
AI Browser (竞品)     85%          ~3000            20s
ocbot 首次执行        85%          ~2000**          15s
ocbot 重复执行        95%+         ~0-200***        3-5s
─────────────────────────────────────────────────────────────
* 传统 RPA: UI 一变就废，长期成功率低
** 首次执行: primitive steps 已省掉部分 token
*** 重复执行: Fast Track + primitive，几乎不消耗 token
```

**Benchmark 执行方式**：
- 定义 10-20 个标准任务覆盖不同类别（电商、社交、金融、办公）
- 每个任务跑 3 轮：首次执行 → 间隔 24h 后重复 → 间隔 7 天后重复
- 记录每轮的三个指标
- 与竞品在相同任务上对比（如 Browser Use、Stagehand、Operator）
- 定期回归（网站 UI 变化后重跑，验证 self-heal 效果）

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

## LLM-Compiled RPA: 与传统 RPA 的对比

ocbot Skill 的执行层本质是 RPA——预定义的动作序列，确定性回放，不依赖 LLM。但生成和维护机制根本不同：**LLM 是 RPA 的编译器 + 维护者。**

```
传统 RPA:  人写脚本 → 回放 → 坏了 → 人修 → 回放 → 坏了 → 放弃
ocbot:    LLM 生成 → 回放 → 坏了 → 自愈 → 回放 → 进化 → 越来越稳
               ↑                        ↑
          自然语言输入              4 级自愈，不需要人
```

| 维度 | 传统 RPA | ocbot Skill |
|------|---------|-------------|
| 创建 | 人手工录制/编写脚本 | 自然语言描述 → LLM 编译为步骤序列 |
| 维护 | UI 变了 → 人修脚本 | UI 变了 → 4 级自愈自动修复 |
| 门槛 | 需要技术背景 | 说人话即可 |
| 稳定性 | 脆弱，UI 一变就废 | 越跑越稳（自愈成功后回写缓存） |
| 复用 | 同一系统内 copy-paste | 跨站通用 Action Primitives |
| 进化 | 不会 | 执行即训练，自动提炼通用模式 |

### Action Primitives

将稳定、通用的浏览器动作（navigate、scroll、下载 PDF、关闭弹窗等）固化为 Action Primitives——不需要 LLM 推理的标准操作。三层确定机制：硬编码（~10 个）→ 模式匹配（~10-20 个）→ 从执行数据涌现。两轮优化：规划后首次执行即省 token，保存时基于实际 actions 更精确匹配。

详见 **[skill-primitives.md](./skill-primitives.md)**。

---

## Compatibility with Claude Skills

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

### ocbot as Superset

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

## Sub-Documents

| Document | Content |
|----------|---------|
| [skill-data-model.md](./skill-data-model.md) | All TypeScript interfaces: Skill, ActionStep, Execution, Heal, Version, Eval, Marketplace, Primitives |
| [skill-primitives.md](./skill-primitives.md) | Action Primitives: 3-tier identification, two-round optimization, emergence pipeline, governance |
| [skill-execution.md](./skill-execution.md) | Matching, Lifecycle (chat-driven creation/editing), Execution & Caching |
| [skill-evolution.md](./skill-evolution.md) | 4-level Self-Heal, Scoring & Fragility, Quality Engineering (Evals, Doctor, Versioning) |
| [skill-distribution.md](./skill-distribution.md) | Open-Source vs Closed-Source, Encryption & Cloud Storage |
| [skill-dev-plan.md](./skill-dev-plan.md) | Development roadmap and phase plan |

## References

- [skill-dev-plan.md](./skill-dev-plan.md) — Development roadmap and phase plan
- [claude-skill-creator-analysis.md](../claude-skill-creator-analysis.md) — Claude skill-creator evals/benchmarks analysis
- [Claude Skills Documentation](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills)
- [Agent Skills Open Standard](https://agentskills.io)
- Stagehand source: `/stagehand/packages/core/lib/v3/` — ActCache, AgentCache, self-heal reference
