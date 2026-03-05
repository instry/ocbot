# Skill Evolution

Self-heal, scoring, fragility detection, and quality engineering.

Parent document: [skill-system.md](./skill-system.md)

---

## Self-Heal: 4-Level Progressive Model

Skill 的核心价值不是"一次录制，永远回放"，而是 **执行即训练** — 每次运行都是一次进化机会。

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

---

## Evolution Logic

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

Eval 定义存储在 `scripts/evals.json`，每个 eval 是 input → expect 断言。

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
