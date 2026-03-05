# Action Primitives（动作原语库）

Action Primitives 是 LLM-Compiled RPA 的核心优化机制——将稳定、通用的浏览器动作固化为标准操作，跳过 LLM 推理。

Parent document: [skill-system.md](./skill-system.md)

---

## 为什么需要 Primitives

网页任务是一连串动作，但不是所有动作都需要 LLM 推理：

- 有些动作**极其稳定**（navigate、scroll、pressKey）— 几乎不会坏
- 有些动作**跨站通用**（下载 PDF、关闭 cookie 弹窗、填写表单）— 与具体网站无关
- 只有 **site-specific 的动作**才真正需要 LLM 推理

将稳定、通用的动作固化为 Action Primitives（预编写、经过测试、不需要 LLM 推理的标准操作），Skill 的 steps 变成：一部分引用 primitive，一部分是 LLM 推理的 custom action。

---

## 三层确定机制

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

---

## 规模治理

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

---

## 两轮优化：规划时 + 保存时

Primitive 优化发生在**两个时机**，不矛盾：

### 第一轮：规划后、执行前（首次执行就省 token）

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

### 第二轮：执行成功后保存时（基于实际 actions 更精确）

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

### 两轮对比

| | 第一轮（规划后） | 第二轮（保存时） |
|---|---|---|
| 时机 | 首次执行前 | 执行成功后 |
| 匹配依据 | instruction 文本 + step type | 实际 actions (method + target) |
| 准确度 | 中（文本匹配） | 高（action pattern） |
| 价值 | 首次执行就省 token | 后续执行更多 step 变 primitive |

---

## 从执行数据中涌现新 Primitives

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

---

## 进化循环

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
