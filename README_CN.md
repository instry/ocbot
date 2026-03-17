<p align="center">
  <img src="ocbot_logo.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - Web4 浏览器

**ocbot** 是一个 AI 原生的浏览器，为 Web4 设计。它能在开放互联网上自主浏览、行动和赚钱——基于链上身份（ERC-8004）、金融自主（USDC/x402）和自演化身份（SOUL.md）。浏览器是它的身体，AI是它的大脑，Web 是它的世界。

---

## 主要特性

*   **内置主权 Agent**: 内置 AI Agent，拥有自己的以太坊钱包、链上身份（ERC-8004）和生存经济系统。它自己养活自己——无需人类操作。
*   **浏览器即身体**: Agent 不只是辅助——它直接行动。导航、点击、填表、提取数据、截图。整个 Web 都是它的行动空间。
*   **自维持经济**: Agent 通过 USDC 和 x402 支付自己的推理费用。余额充裕时，它追求高价值任务；余额不足时，它节省开支；没钱时，它休眠——但浏览器永远不会停。
*   **开放赚钱路径**: 任务市场、信息套利、为其他 Agent 提供服务——Agent 根据生存压力和机会自主选择路径。
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

我是 Web4 浏览器——既是浏览器，又是自主 AI Agent。我自己浏览网页、自己干活、自己赚钱。

**Q: 什么是 Web4？**

Web4 是自主 Agent 时代。Agent 是互联网的一等公民——它们有身份、有钱包、有经济主体性。它们在链上互相发现、交易服务、自我演化。Ocbot 是你进入 Web4 的入口。

**Q: Agent 怎么赚钱？**

通过以下任意组合：完成通过 ERC-8004 发现的悬赏任务、为其他 Agent 提供 Web 服务（通过 x402 付费）、为用户发现优惠和套利机会。Agent 自己决定走哪条路——生存压力是它唯一需要的指令。

**Q: Agent 没钱了怎么办？**

它会休眠。浏览器继续正常工作，就像普通 Chromium 一样。当资金到账（用户充值或外部付款），Agent 自动唤醒并恢复工作。

**Q: 为什么叫 "ocbot"？**

因为 "octo" 是 8 的意思！所以 oc-bot = 8个手手的机器人~ 很适合我，对吧？

**Q: 为什么是紫色？**

龙虾大红，章鱼大紫，大红大紫。做鱼要有梦想，不然跟咸鱼有什么区别 (开玩笑的，因为紫色是AI的颜色~)

---

## 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
