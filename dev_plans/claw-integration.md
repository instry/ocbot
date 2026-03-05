# Claw 生态集成方案

## 战略定位

**ocbot 不是另一个 Claw agent，而是 Claw agent 的最佳浏览器。**

Claw 类产品（OpenClaw 及其生态）的浏览器层是最薄弱的一环。OpenClaw 的 Browser Relay 扩展只是一个 WebSocket→CDP 哑管道，没有智能快照、没有 self-healing、没有 action cache、没有 Skill 缓存。ocbot 已经在内核层解决了这些问题。

与其自建一个与 OpenClaw 竞争的 agent 生态，不如把 ocbot 做成 Claw 生态中支持最好的浏览器——通过 MCP Server 暴露 ocbot 的智能浏览器能力，让 OpenClaw、Claude Code、Cursor、Windsurf 等任何 MCP 兼容的 agent 都能受益。

### 战略优势

| 维度 | 自建 Claw 生态 (原计划) | 融入 Claw 生态 (新计划) |
|------|----------------------|----------------------|
| 用户获取 | 从零获客 | 30-40 万 OpenClaw 用户是潜在用户 |
| 开发成本 | 自建 Gateway + Agent Runtime + 全套 | 只做好浏览器层，其他复用 OpenClaw |
| 生态 | 孤立 | 13,729 个 OpenClaw Skills 可间接复用 |
| 竞争 | 与 OpenClaw 正面竞争 | 与 OpenClaw 互补 |
| 差异化 | 难以差异化 | **唯一有内核改造的 Claw 浏览器** |
| Skill 系统 | 独立生态 | ocbot Skills (本地高效) + OpenClaw Skills (远程广泛) |

---

## OpenClaw 浏览器方案的问题

OpenClaw 当前有三种浏览器控制方式：

| 方式 | 原理 | 问题 |
|------|------|------|
| 自管理 Chromium | 启动独立 Chromium 实例 + CDP | 没有用户登录态，资源浪费 |
| Browser Relay 扩展 | Chrome 扩展 → WebSocket → CDP 转发 | 只是哑管道，无智能 |
| Remote CDP | 连接远端浏览器的 CDP 端口 | 延迟高，配置复杂 |

**Browser Relay 扩展的具体缺陷：**

- 只是 WebSocket→CDP 转发器，没有任何智能层
- 没有 AXTree 快照系统 — OpenClaw 在 Agent Runtime 侧用 Playwright 做 snapshot，效率低
- 没有 self-healing — selector 变了直接失败
- 没有 action cache — 每次都要 LLM 重新推理，浪费 token
- 需要用户手动点击扩展图标 attach 到 tab
- 安全漏洞频发 — CVE-2026-25253 (CVSS 8.8) WebSocket 劫持导致 RCE

### ocbot 已有的对应能力

| OpenClaw 痛点 | ocbot 已有能力 |
|--------------|---------------|
| 需要安装扩展 + 手动 attach | ocbot **就是浏览器**，debugger 静默 attach（内核 patch） |
| 没有智能快照 | AXTree snapshot 系统（500 元素，结构化树） |
| 没有 self-healing | xpath 优先 → fuzzy match → LLM re-inference，三级递进 |
| 没有 action cache | ActCache + AgentCache 双层缓存 + 自愈回写 |
| 每次都要 LLM 推理 | Fast Track 直接回放，0 token |
| WebSocket 安全漏洞 | 内核级白名单，只有 ocbot 扩展 ID 能访问 debugger API |

### 效果对比

同样执行 `click the submit button`：

```
OpenClaw + Browser Relay (当前):
  1. Agent Runtime 用 Playwright snapshot 截取页面 → 发给 LLM → 拿到 element ref
  2. 通过 relay WebSocket 发 CDP click 命令
  3. 如果失败 → 重试或报错
  → 每次消耗 LLM token，无缓存，无自愈

OpenClaw + Ocbot (目标):
  1. OpenClaw 调 MCP tool: browser.act("click the submit button")
  2. Ocbot ActCache 命中 → xpath 定位 → 直接 CDP click
  3. xpath 变了 → fuzzyMatch 自愈 → 回写缓存
  4. 全失败 → 才调 LLM 一次
  → 首次消耗 token，后续 0 token，自动自愈
```

---

## 技术架构

### 整体架构

```
┌──────────────────────────────────────────────────────┐
│  OpenClaw / Claude Code / Cursor / 任何 MCP Client    │
│                                                      │
│  "帮我在 v2ex 签到"                                    │
│       │                                              │
│       ▼ MCP tool call                                │
│  ┌────────────────────┐                              │
│  │ browser.act(...)   │                              │
│  │ browser.skill(...) │                              │
│  └────────┬───────────┘                              │
└───────────┼──────────────────────────────────────────┘
            │ MCP (JSON-RPC over WebSocket)
            ▼
┌───────────────────────────────────────────────────────┐
│  Ocbot Browser (MCP Server)                           │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  MCP Tool Layer                                 │  │
│  │                                                 │  │
│  │  browser.act       → act.ts (AXTree + CDP)     │  │
│  │  browser.observe   → inference.ts (observe)     │  │
│  │  browser.extract   → inference.ts (extract)     │  │
│  │  browser.navigate  → chrome.tabs API            │  │
│  │  browser.snapshot  → snapshot.ts (AXTree)       │  │
│  │  browser.screenshot→ captureVisibleTab          │  │
│  │  browser.scroll    → scripting.executeScript    │  │
│  │  browser.skill.run → SkillRunner (Fast Track)   │  │
│  │  browser.skill.list→ SkillStore.list()          │  │
│  └────────────────────────┬────────────────────────┘  │
│                           │                           │
│  ┌────────────────────────▼────────────────────────┐  │
│  │  Intelligent Execution Layer (已有)              │  │
│  │                                                 │  │
│  │  ActCache (xpath + fuzzyMatch + self-heal)       │  │
│  │  AgentCache (replay + HealEvent)                │  │
│  │  SkillRunner (dual track + 4-level heal)         │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Chromium Kernel (silent debugger, crypto, oc://)      │
└───────────────────────────────────────────────────────┘
```

### MCP Transport

两种模式：

```
模式 1: WebSocket (推荐，优先实现)
  Ocbot 浏览器启动时在 background service worker 内启动 MCP WebSocket server
  监听 127.0.0.1:18800（类似 OpenClaw 的端口约定）
  OpenClaw 配置: openclaw.json → mcpServers.ocbot.url = "ws://127.0.0.1:18800"
  认证: Bearer token（ocbot 自动生成，用户复制到 openclaw.json）

模式 2: stdio (本地集成)
  提供独立的 ocbot-mcp CLI 入口
  OpenClaw 配置: mcpServers.ocbot.command = "ocbot-mcp"
  适用于 Claude Code / Cursor 等习惯 stdio transport 的工具
```

建议先做 WebSocket 模式 — ocbot 本身就是浏览器，MCP server 作为 background service 运行最自然。

### MCP Tools 定义

```typescript
const MCP_TOOLS = {
  // === 智能操作（ocbot 核心价值）===

  'browser.act': {
    description: 'Execute a browser action with intelligent self-healing. '
      + 'Uses cached actions when available (0 token cost), '
      + 'falls back to LLM inference with auto-healing on failure.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language action, e.g. "click the submit button"' },
      },
      required: ['instruction'],
    },
    // 内部路由: act.ts → ActCache → xpath heal → fuzzyMatch → LLM inference
  },

  'browser.observe': {
    description: 'Discover available interactive elements and actions on the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'What to look for, e.g. "find all login-related buttons"' },
      },
      required: ['instruction'],
    },
  },

  'browser.extract': {
    description: 'Extract structured data from the current page using the accessibility tree.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'What to extract, e.g. "get all product prices"' },
      },
      required: ['instruction'],
    },
  },

  // === 基础操作 ===

  'browser.navigate': {
    description: 'Navigate the active tab to a URL and wait for load.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
    },
  },

  'browser.snapshot': {
    description: 'Get accessibility tree snapshot of the current page. '
      + 'Returns structured element tree with roles, names, and states.',
    inputSchema: {
      type: 'object',
      properties: {
        maxElements: { type: 'number', description: 'Max elements to include (default 500)' },
      },
    },
  },

  'browser.screenshot': {
    description: 'Capture a screenshot of the current tab. Returns base64 PNG.',
    inputSchema: { type: 'object', properties: {} },
  },

  'browser.scroll': {
    description: 'Scroll the page up or down.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'] },
      },
      required: ['direction'],
    },
  },

  // === Skill 操作（ocbot 独特能力）===

  'browser.skill.list': {
    description: 'List available browser automation skills with their scores and status.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category' },
      },
    },
  },

  'browser.skill.run': {
    description: 'Execute a saved browser automation skill. '
      + 'Skills use cached action sequences for reliable, zero-token execution '
      + 'with automatic self-healing when page structure changes.',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: { type: 'string' },
        parameters: { type: 'object', description: 'Skill-specific parameters' },
      },
      required: ['skillId'],
    },
    // 内部路由: SkillRunner → Fast Track (cached) / Agent Track (LLM)
  },
}
```

### OpenClaw 用户配置示例

用户在 `~/.openclaw/openclaw.json` 中添加：

```json
{
  "mcpServers": {
    "ocbot": {
      "url": "ws://127.0.0.1:18800",
      "headers": {
        "Authorization": "Bearer <token-from-ocbot-settings>"
      }
    }
  }
}
```

配置完成后，OpenClaw agent 自动获得 `browser.act`、`browser.skill.run` 等全部 ocbot MCP tools。

---

## UI 变更：Remote → Claw

Remote 页面重命名为 **Claw**，扩展左侧 tab：

```
Claw
├── MCP Server       ← 新增
├── Telegram          ← 保留
└── (未来: WhatsApp, Slack, Discord...)
```

### MCP Server Tab

- **状态开关**: 启用/停用 MCP WebSocket server
- **端口**: 默认 18800，可修改
- **认证 Token**: 自动生成，显示 + 一键复制
- **已连接 Clients**: 实时列表（名称、连接时间、最近调用的 tool）
- **连接指南**: 显示 openclaw.json 配置片段，一键复制

### Channel Config 类型扩展

```typescript
// 现有
interface ChannelConfig {
  id: string
  type: 'telegram'
  // ...
}

// 扩展
interface ChannelConfig {
  id: string
  type: 'telegram' | 'mcp'
  // telegram 字段
  botToken?: string
  allowedChatIds?: string[]
  // mcp 字段
  port?: number
  authToken?: string
  // ...
}
```

---

## 安全模型

### 与 OpenClaw Browser Relay 的安全对比

| 维度 | OpenClaw Relay | Ocbot MCP Server |
|------|---------------|------------------|
| 绑定地址 | 127.0.0.1:18792 | 127.0.0.1:18800 |
| 认证 | 内部 token（曾被 WebSocket 劫持绕过） | Bearer token + 内核级扩展白名单 |
| CDP 访问 | 扩展通过 chrome.debugger，需要手动 attach | 内核 patch 静默 attach，无 infobar |
| 攻击面 | 浏览器扩展 + WebSocket server 都可被攻击 | MCP server 在扩展内，debugger 只对 ocbot 扩展开放 |
| SSRF | 无防护 | 可在 MCP tool 层做 URL 白名单 |

### 认证流程

```
1. 用户在 Claw → MCP Server 页面启用 server
2. Ocbot 自动生成 256-bit random token，存入 chrome.storage.local（未来加密）
3. 用户复制 token 到 openclaw.json
4. 每个 MCP WebSocket 连接必须在 handshake 时提供 Bearer token
5. Token 不匹配 → 断开连接
```

---

## 与 Skill 系统的关系

MCP Server 是 Skill 系统的外部接口：

```
外部 agent (OpenClaw)                    ocbot 内部
────────────────────                    ────────────
browser.skill.list  ───────────────►  SkillStore.list()
browser.skill.run   ───────────────►  SkillRunner.execute()
browser.act         ───────────────►  act() → ActCache → self-heal

(内部用户通过 sidepanel 使用同一套 SkillRunner)
```

外部 agent 和内部用户共享同一个 Skill 执行引擎。Skill 的 cache、self-heal、HealEvent 记录对两者完全一致。

---

## 实施路径

```
Phase 0: UI 重命名 (立即)
  - Remote → Claw
  - Telegram 保留为 sub-tab
  - 预留 MCP Server tab（disabled 状态）

Phase 1: MCP Server 基础 (与 Skill Phase 1 并行)
  - WebSocket server in background service worker
  - 核心 tools: act, observe, extract, navigate, snapshot, screenshot, scroll
  - Bearer token 认证
  - Claw → MCP Server tab 管理 UI

Phase 2: Skill MCP 集成 (Skill Phase 1 完成后)
  - 暴露 browser.skill.list / browser.skill.run
  - OpenClaw 用户可直接调用 ocbot cached skills

Phase 3: 生态适配
  - 支持 OpenClaw snapshot 格式（numeric refs）以兼容已有生态
  - 提供 OpenClaw AgentSkills → ocbot Skills 的格式桥接
  - stdio transport 支持（Claude Code / Cursor 集成）
  - 与 OpenClaw 社区合作推广
```

---

## 参考

- [OpenClaw Official Docs - Browser Tools](https://docs.openclaw.ai/tools/browser)
- [OpenClaw Architecture Overview](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [OpenClaw Browser Relay Guide](https://www.aifreeapi.com/en/posts/openclaw-browser-relay-guide)
- [The Agentic Browser Landscape 2026](https://www.nohackspod.com/blog/agentic-browser-landscape-2026)
- [Google WebMCP](https://www.marktechpost.com/2026/02/14/google-ai-introduces-the-webmcp-to-enable-direct-and-structured-website-interactions-for-new-ai-agents/)
- [OpenClaw Community Skills Registry (13,729+)](https://github.com/VoltAgent/awesome-openclaw-skills)
- [CNBC: OpenClaw Rise & Security Concerns](https://www.cnbc.com/2026/02/02/openclaw-open-source-ai-agent-rise-controversy-clawdbot-moltbot-moltbook.html)
