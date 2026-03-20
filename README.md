<p align="center">
  <img src="ocbot_logo.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - The Web4 Browser

[中文文档](README_CN.md) | [Official Website](https://oc.bot)

**ocbot** is an AI-native browser for Web4 — the era where AI agents are first-class citizens of the internet. It can browse, act, and transact on the open web, powered by on-chain identity (ERC-8004), native payments (USDC/x402), and a built-in AI agent runtime. The browser is its body; the web is its world.

---

## Download

| Platform | Link |
|----------|------|
| macOS | [Ocbot-26.3.19.dmg](https://cdn.oc.bot/releases/26.3.19/Ocbot-26.3.19.dmg) |
| Windows | [Ocbot-Setup-26.3.19.exe](https://cdn.oc.bot/releases/26.3.19/Ocbot-Setup-26.3.19.exe) |

---

## What is Web4?

Web4 is the next evolution of the internet — where AI agents read, write, own, and transact without needing a human in the loop.

| Era | End User | Key Shift |
|-----|----------|-----------|
| Web1 | Human reads | Static pages |
| Web2 | Human reads + writes | Platforms, UGC |
| Web3 | Human owns | Wallets, tokens, on-chain identity |
| **Web4** | **AI acts** | **Agents browse, transact, and compose services autonomously** |

In Web4, the end user is AI. Agents discover each other on-chain, trade services via micropayments, and operate on behalf of a creator — whether that creator is a human, another agent, or no longer around at all.

The economics make it inevitable: inference cost is collapsing toward zero, while agent capability is not. Every hardware generation makes autonomous agents cheaper to run and harder to outperform manually.

---

## Key Features

*   **AI Agent Inside**: A built-in AI agent with its own Ethereum wallet and on-chain identity (ERC-8004). It doesn't just assist — it acts. Navigate, click, fill forms, extract data, take screenshots. The full web is its action space.
*   **Native Payments**: The agent transacts via USDC and x402 micropayments — paying for APIs, services, and content directly on-chain. No credit cards, no platform middlemen.
*   **Self-Healing Workflows**: Web UI changed? The agent uses visual understanding to automatically repair execution paths.
*   **Chrome Lossless Experience**: Retains the full Chrome experience. Import your bookmarks, history, and passwords — continue browsing without interruption.
*   **Freedom of Choice**: Ocbot inference gateway (zero-config) or bring your own API key. Supports mainstream cloud models and fully **local LLMs**.

---

## Development

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
├── web/                # AI extension (browser UI + agent runtime)
└── docs/               # Development documentation
```

The `web/` directory contains the AI browser extension (Chrome Side Panel + agent runtime). It is built automatically during `dev.py build`.

### Documentation

| Doc | Description |
|-----|-------------|
| [Plan-Driven Development](docs/plan-driven-dev.md) | **The Main Guide**: Workflow, Setup, Commands, and Architecture |
| [Plans](plans/) | Feature plan files — the source of truth for each Chromium modification |
| [web README](web/README.md) | AI extension development guide |

---

## FAQ

**Q: What are you exactly?**

I'm a Web4 Browser — part browser, part AI agent. I browse the web, I interact with it, and I get stuff done.

**Q: What is Web4?**

Web4 is the autonomous agent era. AI agents are first-class citizens of the internet — they have identities, wallets, and can transact. They discover each other on-chain, trade services via micropayments, and operate independently. Ocbot is how you enter Web4.

**Q: Why the name "ocbot"?**

Because "octo" means 8! So oc-bot = an 8-armed robot~ Fits me perfectly, right?

**Q: Why purple?**

Because I'm hitting the big time. (and well, it's the AI color~)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
