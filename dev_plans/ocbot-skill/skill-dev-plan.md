# Skill System Development Plan

## Current State (2026-03-06)

### Completed (Phase 1 — Core Skill System)
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

### Completed (Phase 2 — Skill Quality + Primitive L1)

#### 2.1 triggerPhrases 匹配 — ✅ DONE
- `types.ts`: Skill 增加 `triggerPhrases: string[]` 字段
- `create.ts`: LLM prompt 从返回 JSON 改为输出结构化 SKILL.md（YAML frontmatter + markdown body）
- `create.ts`: 新增 `parseSkillMd()` 手工解析 frontmatter（无 yaml 依赖）、`validateSkillMd()` 验证
- `create.ts`: `createAutoSkill()` 生成最小 frontmatter skillMd
- `matcher.ts`: 新增 `triggerPhraseMatch()` 作为 Phase 1（triggerPhrases → URL → null 三阶段匹配）
- `store.ts`: 新增 `backfillTriggerPhrases()` + `list()` 首次调用自动回填旧 skill

#### 2.2 结构化 SKILL.md 生成 — ✅ DONE
- `create.ts`: LLM prompt 输出标准化 SKILL.md（YAML frontmatter + Workflow + Preconditions + Success Criteria）
- `create.ts`: 新增 `parseSkillMd()` 解析 frontmatter、`validateSkillMd()` 验证
- 祈使句风格、主动参数化、自动验证

#### 2.3 Primitive Layer 1（硬编码）— ✅ DONE
- `agentCache.ts`: `AgentReplayStep` union variants 增加 `primitive?: boolean` 可选字段（旧数据兼容）
- `agentCache.ts`: `replayAgentSteps()` 两处 L2 heal 调用加 `!step.primitive` 前置条件，primitive step 失败时 fail fast
- `create.ts`: 新增 `markPrimitiveSteps()` helper，navigate/scroll/wait 自动标记 `primitive: true`
- `create.ts`: `createSkillFromExecution`、`createSkillManual`、`createAutoSkill`、`buildFallbackSkill` 四处调用 `markPrimitiveSteps()`
- `types.ts`: `SkillExecution` 增加 `primitiveRatio?: number`
- `runner.ts`: `recordExecution()` 计算并记录 `primitiveRatio`

### In Progress
- Vision MVP: screenshot + AXTree hybrid inference (see plan file)

### Gap Analysis (Code vs Design)

| 能力 | 代码现状 | 设计文档 | Gap |
|------|---------|---------|-----|
| 数据模型 | Skill, SkillParameter, AgentReplayStep, HealEvent, triggerPhrases, primitive | + ActionPrimitive, license | 缺 primitive 类型、分发字段 |
| 匹配 | triggerPhrases → URL hostname → null 三阶段 | 设计一致 | ✅ 完成 |
| 创建 | 结构化 SKILL.md（frontmatter + Workflow/Preconditions/Success Criteria） | 设计一致 | ✅ 完成 |
| 创建质量 | 祈使句风格、主动参数化、自动验证（validateSkillMd） | 设计一致 | ✅ 完成 |
| 执行 | Fast Track + Agent Track + Primitive skip L2 heal | 设计一致 | ✅ 基本完成 |
| 自愈 | L1 fuzzy + L2 step re-inference + L3 segment repair | 设计一致 | ✅ 基本完成 |
| 评分 | 完整公式 + fragility detection | 设计一致 | ✅ 基本完成 |
| Evals | 无 | scripts/evals.json + 自动化测试 | 完全缺失 |
| Primitive | Layer 1 硬编码 ✅ | 3 层体系 + 两轮优化 + 涌现 | 缺 Layer 2/3 |
| Benchmark | 无 | 8 个指标 + 竞品对比 | 完全缺失 |
| 分发 | 无 | Open/Closed source + Encryption | Phase 4/5 |

---

## Phase 2: Skill Quality + Primitive L1 — ✅ Complete

**目标**: 补齐匹配准确性（稳）、引入 Primitive 优化（省+快）。

### 2.1 triggerPhrases 匹配 — ✅ DONE

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

### 2.2 结构化 SKILL.md 生成 — ✅ DONE

**Problem**: `skillMd` 是 LLM 自由生成的 markdown，质量不稳定。L3 heal 没有可靠的结构可依赖。

**Solution**: 更新 LLM prompt，输出标准化 SKILL.md（YAML frontmatter + Workflow + Preconditions + Success Criteria）。

### 2.3 Primitive Layer 1（硬编码）— ✅ DONE

**Problem**: 每个 step 都走相同执行路径，即使 navigate/scroll/wait 这种确定性操作也可能触发不必要的缓存查找。

**Solution**: 识别确定性 step（navigate, scroll, wait），显式标记为 primitive，失败时 fail fast 不走 L2 heal。

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

### 4.4 Cross-device Migration
- ExportWrappedKey / ImportWrappedKey UI
- QR code or text-based key transfer

---

## Phase 5: Optimization + 度量

**Goal**: 度量体系验证改进效果、进阶 Primitive 优化、Eval 质量保障。

### 5.1 Benchmark 框架 —「验证目标达成」

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

### 5.2 Primitive Layer 2（模式匹配）

**依赖**: Phase 2.3 ✅ 已完成

**Steps**:
1. 定义 ~10 个模式规则（download_file, close_popup, fill_search 等）
2. 基于 action pattern（method + target 特征）匹配
3. 两轮优化：
   - 第一轮（规划后）：instruction 文本匹配已知 primitive
   - 第二轮（保存时）：实际 actions 的 pattern 匹配
4. Primitive 替换可逆：失败 → 自愈 → 退回 custom + 负反馈

### 5.3 Primitive Layer 3（涌现）

**依赖**: Phase 4.1（需要云端数据）

- 云端聚合匿名执行数据
- 5 阶段 pipeline: 收集 → 聚类 → 筛选 → 抽象 → 验证
- 新 primitive 入库后 re-optimize 已有 skill

### 5.4 Eval 框架（Skill Doctor lite）

**Steps**:
1. 定义 `SkillEval` 类型 + `EvalAssertion` 类型
2. Skill 详情页增加 "Run Evals" 按钮
3. 执行：隔离标签页 → 运行 skill → 检查断言 → 汇总报告
4. 通过 chat 生成 eval（"帮这个 skill 加测试用例"）

### 5.5 alternativeSelectors 增强

- ActCache 记录历史成功的 selector
- L1 自愈时优先尝试 alternativeSelectors
- LRU 最多 5 个 alternative per action

### 5.6 Hybrid Snapshot

- `capturePageSnapshot` 增加 DOM 属性（class, data-testid）
- 提升 L1 自愈命中率，减少升级到 L2

### 5.7 diffTrees 操作验证

- 对比 action 前后 AXTree 差异
- 检测"点击没效果"的场景

---

## Dependencies

```
Phase 1 ──────────────── ✅ Complete
  │
Phase 2 ────────────────── ✅ Complete (triggerPhrases + SKILL.md + Primitive L1)
  │
Phase 3 (accounts + crypto) ─── ← NEXT
  │
Phase 4 (cloud + marketplace) ── 依赖 Phase 3
  │
Phase 5 (optimization + 度量) ── 最后做
  ├─ 5.1 Benchmark 框架        HIGH   「验证」
  ├─ 5.2 Primitive Layer 2     MEDIUM 「省」+「快」 (依赖 2.3 ✅)
  ├─ 5.3 Primitive Layer 3     MEDIUM  依赖 4.1 (需要云端数据)
  ├─ 5.4 Eval 框架             MEDIUM 「稳」
  └─ 5.5-5.7 增量改进           LOW    可并行
```

## Next Action

**Phase 3.1 — User Account System**:
- Authentication service (JWT/OAuth)
- Device registration (device_id)
- Login/register UI in extension
