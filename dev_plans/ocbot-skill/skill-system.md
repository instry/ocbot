# ocbot Skill System

## Overview

ocbot Skills are **Claude-compatible Agent Skills** extended for browser automation. The core specification follows [Claude's SKILL.md standard](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills) — same frontmatter format, same progressive disclosure, same trigger mechanism — but adds a browser-native execution layer (steps, self-heal, scoring) that Claude Skills don't need.

**Design principle**: An ocbot Skill IS a Claude Skill (SKILL.md + resources). It additionally HAS browser replay data (steps.json) and execution metrics.

**Core architecture principle — Progressive Disclosure: 永远从最小成本开始，按需升级，绝不预付。** 借鉴 [Agent Skills 规范](https://agentskills.io) 的 Progressive Disclosure 思想，这一原则贯穿 ocbot Skill 系统的每一层设计：

| 场景 | Level 1 (cheapest) | Level 2 | Level 3 (most expensive) |
|------|-------|---------|---------|
| **Skill 加载** | metadata ~100 tokens | SKILL.md body ~500 tokens | steps.json 0 tokens (不发 LLM) |
| **Skill 匹配** | triggerPhrases 文本匹配 <1ms | URL + name 匹配 <1ms | LLM 语义匹配 ~500 tokens |
| **执行** | 缓存回放 0 tokens | self-heal L1/L2 0~500 tokens | Agent Track full tokens |
| **Primitive** | 硬编码（确定性） | 模式规则匹配 | 涌现（数据驱动） |
| **LLM 上下文** | 当前页面 + step instruction | + SKILL.md Workflow | + 完整执行历史 |
| **页面理解** | 可视区域 AXTree ~100 元素 | 完整 AXTree ~500 元素 | Hybrid DOM + AXTree |
| **参数收集** | 从用户消息自动提取 | 缺失必填参数 → 弹表单 | 执行中追问 |

**Positioning**: Browser Plugin Terminator — Skills replace traditional Chrome Extensions with AI-driven automation.

**Business model**: The browser is open-source, but the Skill ecosystem is closed. Official high-quality Skills are provided by ocbot; users can also create, Clone, and Fork community Skills.

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

### Action Primitives（动作原语库）

网页任务是一连串动作，但不是所有动作都需要 LLM 推理：

- 有些动作**极其稳定**（navigate、scroll、pressKey）— 几乎不会坏
- 有些动作**跨站通用**（下载 PDF、关闭 cookie 弹窗、填写表单）— 与具体网站无关
- 只有 **site-specific 的动作**才真正需要 LLM 推理

将稳定、通用的动作固化为 Action Primitives（预编写、经过测试、不需要 LLM 推理的标准操作），Skill 的 steps 变成：一部分引用 primitive，一部分是 LLM 推理的 custom action。

### Primitive 三层确定机制

```
第一层: 硬编码 primitives（~10 个，确定性判断）
  navigate, scroll, wait, pressKey, goBack, goForward, switchTab, closeTab, refresh
  → step.type 直接判断，不需要匹配

第二层: 模式匹配 primitives（~10-20 个，系统预置规则）
  download_file: method=click + target.href 匹配 /\.(pdf|csv|xlsx|zip)/
  close_popup:   method=click + target 匹配 cookie/accept/dismiss/close 关键词
  fill_search:   method=type + target.role=searchbox|combobox
  → 基于 action pattern（method + target 特征）的规则匹配

第三层: 涌现 primitives（从执行数据中发现）
  候选条件（全部满足）:
    ① 同样的 action pattern 在 ≥3 个不同 domain 出现过
    ② 历史 heal_level 平均 < 1.0（几乎不需要自愈）
    ③ 成功率 > 90%
    ④ selector 中无 site-specific 特征（如特定 class name）
  → 数据驱动，系统越跑越聪明
```

匹配基于**实际执行的 actions（method + target 特征）**，而非 instruction 文本。不管用户说"下载报告"还是"save the PDF"，底层 action pattern 一样就能匹配。

**Primitive 替换可逆**：如果 primitive step 执行失败触发自愈，回写时退回 custom step，同时给该 primitive 匹配规则一条负反馈。

### Primitive 规模治理

随着第三层涌现 primitive 增多，会出现**匹配冲突**（多个 primitive 都能匹配同一个 step）和**误匹配**（看起来像但实际不适用）。

**冲突解决**：
- 层级优先：第一层 > 第二层 > 第三层
- 同层内按历史成功率排序，选成功率最高的
- confidence 阈值随 primitive 总量增长而提高（30 个时 0.85，100 个时 0.9+）

**误匹配治理**：
- 反馈闭环：primitive step 执行失败 → 自愈触发 → 退回 custom → 负反馈降低该规则匹配权重
- 定期淘汰：第三层 primitive 成功率连续低于 85% → 降级回 custom pattern，不再作为 primitive 推荐
- 第一层和第二层（系统预置）不受淘汰影响，仅第三层（涌现）参与淘汰

**规模预期**：第一层 ~10 个 + 第二层 ~20 个 = 短期内 ~30 个，冲突概率低。第三层涌现是 Phase 4 的事，届时数据量足够支撑更精细的淘汰策略。

### 两轮优化：规划时 + 保存时

Primitive 优化发生在**两个时机**，不矛盾：

**第一轮：规划后、执行前（首次执行就省 token）**

LLM 规划出 steps 后，执行前先扫一遍，把能识别的 primitive 跳过 LLM 推理：

```
用户: "淘宝帮我看看硬盘发票开了没，开了就下载"

LLM 规划输出 7 个 steps:
  step 1: "导航到淘宝"           → navigate        → 第一层 primitive ✓ 跳过推理
  step 2: "点击已买到的宝贝"      → click_by_text   → 第二层 primitive ✓ 跳过推理
  step 3: "找到硬盘订单"          →                 → custom，LLM 推理
  step 4: "点击进入订单详情"       →                 → custom，LLM 推理
  step 5: "找发票入口"            →                 → custom，LLM 推理
  step 6: "检查发票状态"          →                 → custom，LLM 推理
  step 7: "下载发票"             → download_file    → 第二层 primitive ✓ 跳过推理

首次执行就省了 3 个 step 的 LLM 推理
```

这一轮基于 **instruction 文本 + step type** 匹配，能识别第一层和部分第二层 primitive。

**第二轮：执行成功后保存时（基于实际 actions 更精确）**

```typescript
function optimizeSteps(steps: AgentReplayStep[], registry: PrimitiveRegistry): OptimizedStep[] {
  return steps.map(step => {
    if (step.type === 'navigate') {
      return { type: 'primitive', name: 'navigate', params: { url: step.url } }
    }
    if (step.type === 'scroll') {
      return { type: 'primitive', name: 'scroll', params: { direction: step.direction } }
    }
    if (step.type === 'act') {
      // 基于实际 actions 的 pattern 匹配（比 instruction 文本更准）
      const match = registry.matchByActions(step.actions)
      if (match && match.confidence > 0.85) {
        return { type: 'primitive', name: match.primitive.name, params: match.extractedParams }
      }
      // 不匹配 → 记录模式，供第三层涌现分析
      registry.recordPattern(step.instruction, step.actions, step.url)
    }
    return { type: 'custom', ...step }
  })
}
```

这一轮基于 **实际执行的 actions（method + target 特征）** 匹配，能发现第一轮没识别出的 primitive。

**两轮对比**：

| | 第一轮（规划后） | 第二轮（保存时） |
|---|---|---|
| 时机 | 首次执行前 | 执行成功后 |
| 匹配依据 | instruction 文本 + step type | 实际 actions (method + target) |
| 准确度 | 中（文本匹配） | 高（action pattern） |
| 价值 | 首次执行就省 token | 后续执行更多 step 变 primitive |

### 从执行数据中涌现新 Primitives

新 primitives 不是预设的，而是从大量执行数据中**自然涌现**：

```
阶段 1: 收集 — 每次 step 执行，recordPattern() 记录 instruction + actions + domain + success + heal_level
阶段 2: 聚类 — 对 instruction 做 embedding 向量聚类，语义相似的归为一组
阶段 3: 筛选 — 候选条件：≥N 个不同 skill + ≥M 个不同 domain + heal_level < 1.0 + 成功率 > 90%
阶段 4: 抽象 — 从 cluster 中多个 action 序列提取共同模式，参数化 site-specific 部分
阶段 5: 验证 — 随机 K 个站点自动测试，通过率 > 85% 正式入库
```

**示例：涌现 "download_file" primitive**

```
聚类发现 cluster:
  skill_1 (site_A): instruction="下载报告" → actions=[click(a[href$=".pdf"])]
  skill_2 (site_B): instruction="download PDF" → actions=[click(button:has-text("Download"))]
  skill_3 (site_C): instruction="保存文件"   → actions=[click(a[download])]

筛选: 3 个 skill, 3 个 domain, heal_level=0, 成功率=100% ✓

抽象: download_file(selector?) →
  1. 找 a[href$=".pdf"] || a[download] || button:has-text("Download")
  2. 点击 → 等待下载完成

验证: 10 个随机站点测试，通过 9/10 → 入库
```

入库后，**已有的 skill 也自动受益**：后台 re-optimize 扫描所有 skill 的 steps，匹配到新 primitive 的自动替换。

**本地 vs 云端**：
- 本地挖掘（Phase 2）：分析用户自己的执行历史，发现个人重复模式
- 云端挖掘（Phase 4）：聚合匿名数据（只上传 instruction + action pattern，不传用户数据），发现真正通用的 primitive

### 进化循环

```
系统内置 primitives (第一层 ~10 个 + 第二层 ~10-20 个规则)
        ↓
用户输入任务 → LLM 规划 steps
        ↓
第一轮优化: 规划后扫描，识别 primitive steps → 跳过 LLM 推理直接执行
        ↓
执行成功 → 保存为 Skill
        ↓
第二轮优化: 基于实际 actions 做 pattern 匹配 → 发现更多 primitive
        ↓
执行数据积累 → 聚类发现新模式 → 验证 → 第三层涌现 primitive 入库
        ↓
已有 skill re-optimize → 更多 step 变成 primitive
        ↓
整个系统越来越快、越来越稳定、LLM 依赖越来越低
```

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

## Sub-Documents

| Document | Content |
|----------|---------|
| [skill-data-model.md](./skill-data-model.md) | All TypeScript interfaces: Skill, ActionStep, Execution, Heal, Version, Eval, Marketplace, Primitives |
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
