<p align="center">
  <img src="ocbot_logo.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - Your Web4 Agent

[中文文档](README_CN.md) | [Official Website](https://oc.bot)

**Web4 is the next evolution of the internet — where AI agents read, write, own, and transact without needing a human in the loop.**

Ocbot is built for this future. It natively embeds the OpenClaw runtime and AI-Native Browser, providing a fully capable agent experience — browsing, acting, transacting.

---

## 🌟 Key Features

### 🔗 Designed for Web4
- **AI as a First-Class Citizen**: Built for the Agentic Web where AI agents autonomously browse, transact, and compose services.
- **On-Chain Identit & Payments**: ERC-8004 identity, x402 micropayments. The agent pays for APIs, services, and content directly on-chain.

### 🤖 Built-in OpenClaw Runtime
- **Easy Setup**: Embedded OpenClaw. No config or terminal required—just launch the app.
- **Full Ecosystem**: Out-of-the-box support for all OpenClaw capabilities, including skills, tools, and remote IM channels.

### 🌐 AI-Native Browser
- **Deep Kernel Integration**: Not an extension. Modified Chromium kernel for native AI support and deeper control.
- **Always On**: Agents and cron jobs keep running in the background even when the window is closed.


---

## 🚀 Download

| Platform | Link |
|----------|------|
| macOS | [Ocbot-26.3.19.dmg](https://cdn.oc.bot/releases/26.3.19/Ocbot-26.3.19.dmg) |
| Windows | [Ocbot-Setup-26.3.19.exe](https://cdn.oc.bot/releases/26.3.19/Ocbot-Setup-26.3.19.exe) |

---

## 📖 What is Web4?

| Era | End User | Key Shift |
|-----|----------|-----------|
| Web1 | Human reads | Static pages |
| Web2 | Human reads + writes | Platforms, UGC |
| Web3 | Human owns | Wallets, tokens, on-chain identity |
| **Web4** | **AI acts** | **Agents browse, transact, and compose services autonomously** |

In Web4, the end user is AI. Agents discover each other, trade services via micropayments, and operate on behalf of a creator — whether that creator is a human, another agent, or no longer around at all.

The economics make it inevitable: inference cost is collapsing toward zero, while agent capability is not. Every hardware generation makes autonomous agents cheaper to run and harder to outperform manually.

---

## 🛠️ Development

### Prerequisites

- macOS / Linux (Windows untested)
- Python 3
- Node.js + npm (for extension build)
- [Depot Tools](https://chromium.googlesource.com/chromium/tools/depot_tools.git) (for full build)

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/instry/ocbot.git

# 2. Check your environment
./scripts/dev.py check

# 3. Download Chromium source
./scripts/dev.py download                          # Quick tarball (code review only)
./scripts/dev.py download --method depot --no-history  # Full source (for building)

# 4. Apply existing patches to get the current ocbot state
./scripts/dev.py patch

# 5. Build (This takes time!)
# - M3 Ultra + 96G RAM: ~45 min
# - M4 + 24G RAM: ~4.5 hours
./scripts/dev.py build

# 6. Run
./scripts/dev.py run
```

### Project Structure

```
ocbot/
├── scripts/            # Dev tooling (dev.py, build.py, run.py, etc.)
├── patches/            # Generated Chromium patches
├── plans/              # Feature plan files (source of truth)
├── web/                # UI extension (Lit 3 + OpenClaw Gateway UI)
└── docs/               # Development documentation
```

---

## ❓ FAQ

**Q: What are you exactly?**

I'm a Web4 Agent. I live on the web. I browse, I think, I act, I get stuff done.

**Q: How does Ocbot relate to OpenClaw?**

OpenClaw is the agent engine inside Ocbot. Ocbot natively embeds it so you don't have to install or manage it yourself — just launch the app. Ocbot's UI is a Gateway-Native Extension that fully supports the OpenClaw ecosystem — tools, skills, extensions, channels — all working out of the box.

**Q: Why the name "ocbot"?**

Because "octo" means 8! So oc-bot = an 8-armed robot~ Fits me perfectly, right?

**Q: Why purple?**

Because I'm hitting the big time. (and well, it's the AI color~)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
