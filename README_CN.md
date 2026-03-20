<p align="center">
  <img src="ocbot_logo.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - Web4 浏览器

**ocbot** 是一个 AI 原生的浏览器，为 Web4 设计。它能在开放互联网上浏览、行动和交易——基于链上身份（ERC-8004）、原生支付（USDC/x402）和内置 AI Agent 运行时。浏览器是它的身体，Web 是它的世界。

---

## 什么是 Web4？

Web4 是互联网的下一次演化——AI Agent 成为互联网的一等公民，无需人类介入即可读、写、拥有和交易。

| 时代 | 终端用户 | 关键变化 |
|------|----------|----------|
| Web1 | 人类阅读 | 静态页面 |
| Web2 | 人类读写 | 平台、用户生成内容 |
| Web3 | 人类拥有 | 钱包、代币、链上身份 |
| **Web4** | **AI 行动** | **Agent 自主浏览、交易、组合服务** |

在 Web4，终端用户是 AI。Agent 在链上互相发现，通过微支付交易服务，代表创建者运行——无论创建者是人类、另一个 Agent，还是已经不在了。

经济规律使这一切不可避免：推理成本正在趋近于零，而 Agent 能力并没有。每一代硬件都让自主 Agent 更便宜、更强。

---

## 主要特性

*   **内置 AI Agent**: 内置 AI Agent，拥有自己的以太坊钱包和链上身份（ERC-8004）。它不只是辅助——它直接行动。导航、点击、填表、提取数据、截图。整个 Web 都是它的行动空间。
*   **原生支付**: Agent 通过 USDC 和 x402 微支付进行交易——直接在链上支付 API、服务和内容。无需信用卡，没有平台中间商。
*   **自愈工作流**: Web UI 变了？Agent 使用视觉理解自动修复执行路径。
*   **Chrome 无损体验**: 保留完整的 Chrome 体验。导入你的书签、历史记录和密码——无缝继续浏览。
*   **自由选择**: Ocbot 推理网关（零配置）或自带 API Key。支持主流云端模型和**本地 LLM**。

---

## 开发

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
├── web/                # AI 扩展 (浏览器 UI + Agent 运行时)
└── docs/               # 开发文档
```

`web/` 目录包含 AI 浏览器扩展（Chrome 侧边栏 + Agent 运行时）。它会在 `dev.py build` 期间自动构建。

### 文档

| 文档 | 描述 |
|-----|-------------|
| [计划驱动开发](docs/plan-driven-dev.md) | **主要指南**: 工作流、设置、命令和架构 |
| [Plans](plans/) | 功能计划文件——每次 Chromium 修改的真理之源 |
| [web README](web/README.md) | AI 扩展开发指南 |

---

## 常见问题 (FAQ)

**Q: 你到底是什么？**

我是 Web4 浏览器——既是浏览器，又是 AI Agent。我浏览网页，与之交互，把事情搞定。

**Q: 什么是 Web4？**

Web4 是自主 Agent 时代。AI Agent 是互联网的一等公民——它们有身份、有钱包、能交易。它们在链上互相发现，通过微支付交易服务，独立运行。Ocbot 是你进入 Web4 的入口。

**Q: 为什么叫 "ocbot"？**

因为 "octo" 是 8 的意思！所以 oc-bot = 8个手手的机器人~ 很适合我，对吧？

**Q: 为什么是紫色？**

因为大红大紫。(开玩笑的，因为紫色是AI的颜色~)

---

## 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
