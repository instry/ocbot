---

# Stagehand 技术分析与核心机制研究

## 1. 项目概览

[Stagehand](file:///Users/ekko/git/ocbot/stagehand/README.md) 是一个由 Browserbase 开发的现代 AI 浏览器自动化框架。其核心设计理念是 **"将 AI 的灵活性与代码的精确性相结合"**，旨在解决传统浏览器自动化脚本脆弱、维护成本高的问题。

## 2. 核心亮点

### 2.1 混合驱动模式 (Hybrid Driver)
Stagehand 允许开发者在同一工作流中灵活切换控制方式：
*   **AI 驱动 (`act`, `extract`, `observe`)**: 使用自然语言处理复杂、动态或未知的 UI 交互。
*   **代码驱动 (CDP/Playwright)**: 使用底层 API 处理确定性高、性能要求高的操作。

### 2.2 CDP 原生引擎 (CDP-native)
基于 Chrome DevTools Protocol (CDP) 直接构建，而非仅仅是对 Playwright/Puppeteer 的封装。
*   **优势**: 提供更细粒度的浏览器控制和更低的抽象层开销，性能更优。

### 2.3 结构化数据提取
集成 Zod Schema 支持，允许开发者定义数据结构，由 AI 自动从非结构化网页中提取并验证数据，返回类型安全的 JSON 对象。

## 3. 自动缓存与自愈机制 (Auto-caching & Self-healing)

这是 Stagehand 最具创新性的特性，用于解决 AI Agent 运行慢（推理延迟）和贵（Token 消耗）的问题，同时保持脚本的稳定性。

### 3.1 自动缓存 (Auto-caching)

Stagehand 不仅仅缓存 HTML，而是缓存 **AI 生成的操作路径**。

*   **缓存键生成 (Cache Key)**:
    基于 SHA-256 哈希，由以下要素组成：
    *   **指令内容**: (e.g., "点击登录按钮")
    *   **起始 URL**: 操作开始时的页面地址
    *   **配置签名**: 模型版本、系统提示词 (System Prompt)、工具集定义
    *   **变量**: 指令中使用的变量名
    *   *参考代码*: [AgentCache.ts](file:///Users/ekko/git/ocbot/stagehand/packages/core/lib/v3/cache/AgentCache.ts#L518-533)

*   **存储机制**:
    LLM 成功执行任务后，Stagehand 将操作步骤 (`AgentReplayStep`) 序列化为 JSON 文件存储。包含具体的动作类型（如 `click`）、选择器 (`selector`) 和页面状态快照。
    *   *参考代码*: [AgentCache.ts](file:///Users/ekko/git/ocbot/stagehand/packages/core/lib/v3/cache/AgentCache.ts#L353-362)

*   **回放模式 (Replay)**:
    后续运行时，如果缓存命中，直接按照序列化的步骤执行底层 DOM 操作，**完全跳过 LLM 推理**，实现毫秒级响应和零 Token 消耗。

### 3.2 自愈机制 (Self-healing)

自愈机制是缓存回放的"安全网"，确保脚本在 UI 变更时不会轻易中断。

*   **失效检测**:
    在回放过程中，使用 `waitForCachedSelector` 检查缓存的选择器在当前 DOM 中是否有效（默认超时 15s）。
    *   *参考代码*: [utils.ts](file:///Users/ekko/git/ocbot/stagehand/packages/core/lib/v3/cache/utils.ts#L22-48)

*   **动态降级 (Fallback)**:
    一旦检测到选择器失效或操作失败，系统立即**降级回 LLM 推理模式**。它会捕获当前最新的页面快照，重新将原始指令发送给 AI，让 AI 分析新的页面结构并寻找替代路径。
    *   *参考代码*: [AgentCache.ts](file:///Users/ekko/git/ocbot/stagehand/packages/core/lib/v3/cache/AgentCache.ts#L718)

*   **缓存更新**:
    如果 AI 成功找到了新的操作路径并完成任务，Stagehand 会自动**更新缓存文件**，用新的有效选择器替换旧数据。下一次运行将再次使用高速回放模式。
    *   *参考代码*: [AgentCache.ts](file:///Users/ekko/git/ocbot/stagehand/packages/core/lib/v3/cache/AgentCache.ts#L610)

## 4. 总结

Stagehand 通过"AI 生成 -> 缓存固化 -> 异常自愈"的闭环，实现了自动化脚本的**可进化性**。它既拥有 AI Agent 的通用性和适应性，又具备传统脚本的运行效率和低成本，为下一代浏览器自动化工具提供了重要的参考范式。

---
**相关阅读**:
*   [ocbot 技术路线与架构策略](./ocbot-technical-roadmap.md): 基于 Stagehand 分析的 ocbot 专属优化方案（混合视觉策略、内核级优化等）。
