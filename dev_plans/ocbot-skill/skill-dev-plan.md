# Skill System Development Plan

## Current State (2026-03-05)

### Completed (Phase 1)
- Skill data model + local store (`lib/skills/types.ts`, `lib/skills/store.ts`)
- "Save as Skill" flow with background creation + "Creating..." status
- SkillRunner with dual-track execution (Fast Track + Agent Track)
- L2 self-heal (step re-inference) + L3 segment repair
- Skill matching: URL hostname + name keywords (Phase 1 matcher)
- Auto-Skill: automatic recording + exact matching + fast-track-only execution
- Skills page: real data, My Skills / Marketplace tabs, skill detail, skill edit
- Execution history + scoring (full formula) + fragility detection
- Parameter system: `%paramName%` substitution, SkillParameter types, UI form
- Skill detail deep link: `oc://home/skills/detail?id=xxx`
- Storage change listener for cross-page sync (sidepanel ↔ home page)

### In Progress
- Vision MVP: screenshot + AXTree hybrid inference (see plan file)

### Gap Analysis (Code vs Design)

| 能力 | 代码现状 | 设计文档 | Gap |
|------|---------|---------|-----|
| 数据模型 | Skill, SkillParameter, AgentReplayStep, HealEvent | + ActionPrimitive, license, triggerPhrases | 缺 primitive 类型、分发字段 |
| 匹配 | URL hostname + name 关键词 | + triggerPhrases 快速匹配 → URL → LLM 语义 | 缺 triggerPhrases |
| 创建 | LLM 生成 name/description/categories | + 结构化 SKILL.md（frontmatter + Workflow/Preconditions/Success Criteria） | skillMd 自由格式，无标准 section |
| 创建质量 | 无写作规范、无参数自动识别、无创建后验证 | + 祈使句风格、主动参数化、自动验证（对标 skill-creator） | prompt 无指导，无验证步骤 |
| 执行 | Fast Track + Agent Track | + Primitive steps 直接执行（0 token） | 无 primitive 优化 |
| 自愈 | L1 fuzzy + L2 step re-inference + L3 segment repair | 设计一致 | ✅ 基本完成 |
| 评分 | 完整公式 + fragility detection | 设计一致 | ✅ 基本完成 |
| Evals | 无 | scripts/evals.json + 自动化测试 | 完全缺失 |
| Primitive | 无 | 3 层体系 + 两轮优化 + 涌现 | 完全缺失 |
| Benchmark | 无 | 8 个指标 + 竞品对比 | 完全缺失 |
| 分发 | 无 | Open/Closed source + Encryption | Phase 3/4 |

---

## Phase 2A: 立即可做（无依赖，高 ROI）

**目标**: 补齐匹配准确性（稳）、引入 Primitive 优化（省+快）、建立度量体系（验证目标）。

### 2A.1 triggerPhrases 匹配 — HIGH PRIORITY「稳」

**Problem**: `matchSkill()` 用 URL hostname + name 关键词匹配，不够准。LLM 语义匹配可用但已禁用（太慢）。

**Files**: `lib/skills/types.ts`, `lib/skills/matcher.ts`, `lib/skills/create.ts`

**Steps**:
1. `types.ts`: 添加 `triggerPhrases: string[]` 到 `Skill` interface
2. `create.ts`: 更新 `createSkillFromExecution` LLM prompt，生成 3-5 个触发短语（中英文、不同说法、常见缩写）
3. `matcher.ts`: 更新 `matchSkill()` 三阶段匹配：
   - Phase 1: `skill.triggerPhrases.some(p => normalizedMessage.includes(p))` → confidence: 'strong'
   - Phase 2 (existing): URL hostname + name keywords
   - Phase 3 (optional): LLM semantic match
4. 已有 skill 回填：对 `triggerPhrases` 为空的 skill，从 name + description 提取关键词
5. UI: SkillEditPage 支持编辑 triggerPhrases（tag input）

**Verification**: 创建 skill，验证 triggerPhrases 生成。用不同说法测试匹配。

**Estimate**: ~200 行改动

### 2A.2 结构化 SKILL.md 生成 — HIGH PRIORITY「稳」

**Problem**: `skillMd` 是 LLM 自由生成的 markdown，质量不稳定。L3 heal 没有可靠的结构可依赖。

**Reference**: 对标 [Claude skill-creator](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills) 的创建流程——理解→规划→结构化→迭代。当前 `create.ts` 只做了"总结"（返回 JSON），缺少"规划"（识别参数化值、脆弱步骤、成功标准）。

**Files**: `lib/skills/create.ts`

**Solution**: 更新 LLM prompt，输出标准化 SKILL.md（YAML frontmatter + Workflow + Preconditions + Success Criteria）。LLM 不只是总结 steps，还要主动规划：识别可参数化的值、分析哪些步骤依赖特定 UI 元素（可能脆弱）、定义明确的成功标准。

**Template for LLM prompt**:
```
You are a skill-metadata generator for a browser automation agent.
Analyse the recorded execution steps and generate a structured SKILL.md.

## Output Rules

**Writing style**: Use imperative/infinitive form ("Navigate to...", "Click the button").
Do NOT use second person ("you should", "you need to").
Be concrete: include specific URLs, selectors, text to look for — not vague descriptions.

**description**: Must state BOTH what the skill does AND when to use it.
Good: "Track product prices on Taobao. Use when monitoring price changes for specific products."
Bad: "A skill for Taobao."

**triggerPhrases**: Generate 3-5 phrases a user would actually say to trigger this skill.
Include: Chinese + English variations, different wordings, common abbreviations.

**parameters**: Actively identify user-configurable values from the steps:
search terms, usernames, URLs, quantities, dates, email addresses, etc.
Mark as required if the skill cannot run without them.

**Workflow**: Each step should be concrete enough that an LLM can re-execute it
from the SKILL.md alone (Agent Track / L3 self-heal scenario).

## Output Structure

---
name: <kebab-case-name, max 60 chars>
description: <what it does + when to use it>
triggerPhrases:
  - "<phrase 1>"
  - "<phrase 2>"
  - "<phrase 3>"
startUrl: "<url>"
categories:
  - <category>
parameters:
  - name: <param_name>
    type: string|number|boolean|select
    description: "<description>"
    required: true|false
---

# <Skill Title>

## Workflow
1. <step 1>
2. <step 2>
...

## Preconditions
- <precondition 1>

## Success Criteria
- <criterion 1>

## Notes
- <edge case or limitation>
```

**Steps**:
1. 更新 `createSkillFromExecution` prompt，要求输出结构化 SKILL.md（含写作风格、参数识别、triggerPhrases 生成指导）
2. 解析 frontmatter → 填充 Skill 字段（name, description, triggerPhrases, categories, parameters）
3. 存储完整 SKILL.md（frontmatter + body）到 `skillMd` 字段
4. 更新 `createAutoSkill` 生成最小结构化 skillMd
5. **创建后自动验证**（参考 skill-creator Step 5 packaging validation）：
   - frontmatter 完整性：name, description, triggerPhrases, startUrl 必须存在
   - triggerPhrases 数量 ≥ 3
   - body 包含 `## Workflow` section
   - description 包含 "when to use" 语义（长度 > 20 字符）
   - 验证失败 → 回退到基本 metadata（不阻塞保存，但标记质量低）

**Verification**: 从不同类型任务创建 skill，验证：(1) SKILL.md 包含所有标准 section (2) 写作风格为祈使句 (3) triggerPhrases ≥ 3 且含多语言 (4) parameters 自动识别了可配置值 (5) 创建后验证通过。

**Estimate**: ~200 行改动（prompt 重写 + frontmatter 解析 + 验证逻辑）

### 2A.3 Primitive Layer 1（硬编码）— MEDIUM PRIORITY「省」+「快」

**Problem**: 每个 step 都走相同执行路径，即使 navigate/scroll/wait 这种确定性操作也可能触发不必要的缓存查找。

**Files**: `lib/skills/runner.ts`, `lib/skills/types.ts`

**Solution**: 识别确定性 step（navigate, scroll, wait, pressKey 等），显式标记为 primitive，执行时跳过 LLM 推理和缓存查找。

**Steps**:
1. `types.ts`: AgentReplayStep 增加可选 `primitive?: boolean` 标记
2. `runner.ts`: replayAgentSteps 中，primitive step 直接执行，不走 ActCache
3. 保存 skill 时，对 navigate/scroll/wait/pressKey 类型的 step 自动标记 `primitive: true`
4. 度量：记录 primitive ratio（primitive steps / total steps）到 SkillExecution

**Verification**: 回放包含 navigate + scroll 的 skill，确认这些 step 不触发 ActCache lookup。

**Estimate**: ~100 行改动

---

## Phase 2B: 短期跟进

### 2B.1 Benchmark 框架 —「验证目标达成」

**Problem**: 没有度量体系，无法证明"稳省快"的改进。

**Steps**:
1. 定义 10 个标准任务（覆盖电商/社交/金融/办公类别）
2. 每个任务记录 3 个指标：success rate / tokens per task / time to complete
3. 跑 3 轮：首次 → 24h 后重复 → 7 天后重复
4. 输出对比报告（vs 纯 LLM agent baseline）

**标准任务示例**:
- 淘宝搜索商品价格
- LinkedIn 查看个人主页
- GitHub 创建 issue
- Google 搜索 + 摘要提取
- PDF 下载（任意站点）

### 2B.2 Primitive Layer 2（模式匹配）

**依赖**: 2A.3 完成后

**Steps**:
1. 定义 ~10 个模式规则（download_file, close_popup, fill_search 等）
2. 基于 action pattern（method + target 特征）匹配
3. 两轮优化：
   - 第一轮（规划后）：instruction 文本匹配已知 primitive
   - 第二轮（保存时）：实际 actions 的 pattern 匹配
4. Primitive 替换可逆：失败 → 自愈 → 退回 custom + 负反馈

### 2B.3 Eval 框架（Skill Doctor lite）

**Steps**:
1. 定义 `SkillEval` 类型 + `EvalAssertion` 类型
2. Skill 详情页增加 "Run Evals" 按钮
3. 执行：隔离标签页 → 运行 skill → 检查断言 → 汇总报告
4. 通过 chat 生成 eval（"帮这个 skill 加测试用例"）

### 2B.4 alternativeSelectors 增强

- ActCache 记录历史成功的 selector
- L1 自愈时优先尝试 alternativeSelectors
- LRU 最多 5 个 alternative per action

### 2B.5 Hybrid Snapshot

- `capturePageSnapshot` 增加 DOM 属性（class, data-testid）
- 提升 L1 自愈命中率，减少升级到 L2

### 2B.6 diffTrees 操作验证

- 对比 action 前后 AXTree 差异
- 检测"点击没效果"的场景

---

## Phase 3: Accounts + Encryption

**Goal**: 用户身份和 E2EE 加密。

### 3.1 User Account System
- Authentication service (JWT/OAuth)
- Device registration (device_id)
- Login/register UI in extension

### 3.2 `chrome.ocbot.crypto` API (Chromium Patch)
- `ocbot_crypto.mojom` + C++ implementation (~400 lines)
- IDL + API binding (~200 lines)
- Extension ID whitelist (~50 lines)
- Operations: Initialize, Encrypt, Decrypt, ExportWrappedKey, ImportWrappedKey
- Master Key in OS Keychain ("Ocbot Safe Storage")

### 3.3 Encrypt Existing Sensitive Data
- Provider API keys, Channel bot tokens
- Migrate from plaintext to encrypted storage

---

## Phase 4: Cloud + Marketplace

**Goal**: Skill 分享、发现和生态。

### 4.1 Cloud Skill Store
- Backend API: CRUD + sync for private skills
- Client sync: upload encrypted blobs, incremental pull by timestamp

### 4.2 Marketplace
- Public skill publishing with distribution key mechanism
- Search/browse by category, rating, usage
- Clone (read-only copy) and Fork (independent copy)
- Open-source vs Closed-source distribution

### 4.3 Claude Skill Interoperability
- **Import**: Claude SKILL.md bundles → Agent Track → 录制积累 steps.json
- **Export**: 开源 skill → zip / GitHub push

### 4.4 Primitive Layer 3（涌现）
- 云端聚合匿名执行数据
- 5 阶段 pipeline: 收集 → 聚类 → 筛选 → 抽象 → 验证
- 新 primitive 入库后 re-optimize 已有 skill

### 4.5 Cross-device Migration
- ExportWrappedKey / ImportWrappedKey UI
- QR code or text-based key transfer

---

## Dependencies

```
Phase 1 ──────────────── ✅ Complete
  │
Phase 2A.1-2A.3 ────────── 立即开始（无依赖）
  ├─ 2A.1 triggerPhrases         HIGH   「稳」
  ├─ 2A.2 结构化 SKILL.md       HIGH   「稳」
  └─ 2A.3 Primitive Layer 1     MEDIUM 「省」+「快」
  │
Phase 2B.1-2B.6 ────────── 2A 完成后跟进
  ├─ 2B.1 Benchmark 框架        HIGH   「验证」
  ├─ 2B.2 Primitive Layer 2     MEDIUM 「省」+「快」 (依赖 2A.3)
  ├─ 2B.3 Eval 框架             MEDIUM 「稳」
  └─ 2B.4-2B.6 增量改进          LOW    可并行
  │
Phase 3 (accounts + crypto) ─── 可与 Phase 2B 并行
  │
Phase 4 (cloud + marketplace) ── 依赖 Phase 3
  └─ 4.4 Primitive Layer 3      依赖 4.1 (需要云端数据)
```

## Next Action

**Phase 2A（三个任务可并行开发）**:
1. `2A.1` triggerPhrases — matcher.ts + create.ts + types.ts
2. `2A.2` 结构化 SKILL.md — create.ts prompt 更新
3. `2A.3` Primitive Layer 1 — runner.ts 执行优化
