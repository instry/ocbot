<p align="center">
  <img src="ocbot_logo.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - Web4 Agent

[English](README.md) | [Official Website](https://oc.bot)

**Web4 是互联网的下一次演化——AI Agent 成为互联网的一等公民，无需人类介入即可读、写、拥有和交易。**

Ocbot 是为这个未来而生的 AI Agent。它内嵌 [OpenClaw] 运行时和 AI-Native 浏览器，提供一个完整的 Agent 体验——浏览、行动、交易。

---

## 🌟 核心特性

### 🤖 内置 OpenClaw 运行时
- **简单使用**：像安装普通应用一样简单。无需配置或使用终端即可使用。
- **完整生态**：开箱即用支持 OpenClaw 的所有能力，包括 skills、tools 和远程 IM 渠道。

### 🌐 AI-Native 浏览器
- **深度内核集成**：不仅仅是一个扩展。我们修改了 Chromium 内核，以原生支持 AI 能力，实现更深层的控制。
- **始终运行**：即使关闭窗口，Agent 和定时任务也会在后台持续运行。

### 🔗 面向 Web4 设计
- **AI 作为一等公民**：专为 Agentic Web 构建，AI Agent 可自主浏览、交易和组合服务。
- **On-Chain 身份和支付**：内置 ERC-8004 身份和钱包。Agent 可以通过 USDC 和 x402 微支付直接为 API、服务和内容付费。

---

## 🚀 下载

| 平台 | 下载链接 |
|----------|------|
| macOS | [Ocbot-26.3.19.dmg](https://cdn.oc.bot/releases/26.3.19/Ocbot-26.3.19.dmg) |
| Windows | [Ocbot-Setup-26.3.19.exe](https://cdn.oc.bot/releases/26.3.19/Ocbot-Setup-26.3.19.exe) |

---

## 📖 什么是 Web4?

| 时代 | 终端用户 | 关键变化 |
|------|----------|----------|
| Web1 | 人类阅读 | 静态页面 |
| Web2 | 人类读写 | 平台、用户生成内容 |
| Web3 | 人类拥有 | 钱包、代币、链上身份 |
| **Web4** | **AI 行动** | **Agent 自主浏览、交易、组合服务** |

在 Web4 中，终端用户是 AI。Agent 互相发现，通过微支付交易服务，代表创建者运行——无论创建者是人类、另一个 Agent，还是已经不在了。

经济规律使这一切不可避免：推理成本正在趋近于零，而 Agent 能力并没有。每一代硬件都让自主 Agent 更便宜、更强。

---

## 🛠️ 开发

### 先决条件

- macOS / Linux (Windows 未测试)
- Python 3
- Node.js + npm (用于构建扩展)
- [Depot Tools](https://chromium.googlesource.com/chromium/tools/depot_tools.git) (用于完整构建)

### 快速开始

```bash
# 1. 克隆代码库
git clone https://github.com/instry/ocbot.git

# 2. 检查环境
./scripts/dev.py check

# 3. 下载 Chromium 源码
./scripts/dev.py download                          # 快速 tarball (仅用于代码审查)
./scripts/dev.py download --method depot --no-history  # 完整源码 (用于构建)

# 4. 应用现有补丁以获取当前的 ocbot 状态
./scripts/dev.py patch

# 5. 构建 (这需要时间!)
# - M3 Ultra + 96G RAM: ~45 分钟
# - M4 + 24G RAM: ~4.5 小时
./scripts/dev.py build

# 6. 运行
./scripts/dev.py run
```

### 项目结构

```
ocbot/
├── scripts/            # 开发工具 (dev.py, build.py, run.py 等)
├── patches/            # 生成的 Chromium 补丁
├── plans/              # 功能计划文件 (真理之源)
├── web/                # UI 扩展（Lit 3 + OpenClaw Gateway UI）
└── docs/               # 开发文档
```

### 文档

| 文档 | 描述 |
|-----|-------------|
| [计划驱动开发](docs/plan-driven-dev.md) | **主要指南**: 工作流、设置、命令和架构 |
| [Plans](plans/) | 功能计划文件——每次 Chromium 修改的真理之源 |
| [web README](web/README.md) | UI 扩展开发指南 |

---

## ❓ 常见问题 (FAQ)

**Q: 你到底是什么？**

我是 Web4 Agent。我住在 Web 上。我浏览、我思考、我行动、我把事情搞定。

**Q: Ocbot 和 OpenClaw 是什么关系？**

OpenClaw 是 Ocbot 内部的 Agent 引擎。Ocbot 原生内嵌它，你不需要单独安装或管理——只需启动应用。Ocbot 的 UI 是 Gateway-Native 的扩展，完全支持 OpenClaw 生态——工具、技能、扩展、渠道——全部开箱即用。

**Q: 为什么叫 "ocbot"？**

因为 "octo" 是 8 的意思！所以 oc-bot = 8个手手的机器人~ 很适合我，对吧？

**Q: 为什么是紫色？**

因为大红大紫。(开玩笑的，因为紫色是AI的颜色~)

---

## 📄 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)