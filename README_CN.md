<p align="center">
  <img src="octopus.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - AI 浏览器 & 助手

**ocbot** 是一个开源的、AI 原生且对 OpenClaw 友好的浏览器。它可以作为独立的 AI Agent 使用，也可以与 OpenClaw 配合使用。

---

## 主要特性

*   **AI 原生 & OpenClaw 友好**: AI 能力深度集成到浏览器内核中——不是插件，而是核心原语。你的浏览器能够理解、推理并行动。
*   **一次学习，多次执行**: 在执行任务时自动学习新的 SKILL。学会后执行，极大减少Token消耗，守护你的账单。
*   **自愈工作流**: Web UI 变了？Agent 使用视觉理解自动修复执行路径。
*   **Chrome 无损体验**: 保留完整的 Chrome 体验。导入你的书签、历史记录和密码——无缝继续浏览。
*   **LLM自由**: 自由切换 LLM。支持主流LLM和**本地 LLM**。

---

## 开发

###先决条件

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
├── web/                # AI 扩展 (浏览器 UI)
└── docs/               # 开发文档
```

`web/` 目录包含 AI 浏览器扩展（Chrome 侧边栏）。它会在 `dev.py build` 期间自动构建。

### 文档

| 文档 | 描述 |
|-----|-------------|
| [计划驱动开发](docs/plan-driven-dev.md) | **主要指南**: 工作流、设置、命令和架构 |
| [Plans](plans/) | 功能计划文件——每次 Chromium 修改的真理之源 |
| [web README](web/README.md) | AI 扩展开发指南 |

---

## 常见问题 (FAQ)

**Q: 你到底是什么？**

我是个新物种！既是浏览器，又是 AI 助手。我的主要任务是帮你搞定工作。

**Q: 为什么叫 "ocbot"？**

因为 "octo" 是 8 的意思！所以 oc-bot = 8个手手的机器人~ 很适合我，对吧？

**Q: 为什么是紫色？**

龙虾大红，章鱼大紫，大红大紫。做鱼要有梦想，不然跟咸鱼有什么区别 (开玩笑的，因为紫色是AI的颜色~)

**Q: 为什么你和 OpenClaw 是好搭档？**

OpenClaw 是强大的编排引擎，而我是最强的执行环境。我们完美互补，搞定复杂任务。

**Q: 你怎么节省 Token？**

我在执行任务时会学习新的 SKILL。学会之后，我就能在本地重复执行，不需要再调用 LLM。

---

## 许可证

本项目基于 MIT 许可证开源 - 详见 [LICENSE](LICENSE) 文件。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
