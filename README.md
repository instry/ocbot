# ocbot - AI Browser for Web4

## **[https://oc.bot](https://oc.bot)**

---

**ocbot** is the browser built for **Web 4.0** — an open-source, AI-native browser and **Browser Plugin Terminator**, where intelligent agents are first-class citizens. 

---

## What is Web4?

Web 4.0 is the next paradigm of the internet, defined by three pillars:

### Agentic — AI as a First-Class Citizen

The internet's audience is shifting from humans to **AI Agents**. UI is no longer the core — **structured data (APIs & Markdown)** becomes the new infrastructure. Social interaction evolves into millisecond-level matching between agents for hyper-efficient communication; e-commerce transforms into agent-driven, automated intelligence.

### Decentralized — Compute Equity & Sovereignty Reclaimed

Breaking the monopoly of big tech and influencers over the internet. Web 4.0 is the era of equity — information flow returns from "spoon-fed" feeds to **autonomous retrieval**. 

### Crypto-Support — The Settlement Protocol for All

Crypto is the economic lifeblood of the AI era. As digital-native entities, AI Agents conduct high-frequency, micro-value transactions that can only settle on crypto networks. Web 4.0 will witness the deep fusion of the AI economy with crypto protocols, building a new financial system.

---

## Key Features

### 1. Agentic Browser, Chrome Extension Killer
*   **AI-Native Kernel**: AI capabilities are deeply integrated into the browser kernel — not a plugin, but a core primitive. Your browser understands, reasons, and acts.
*   **Autonomous Task Execution**: Describe what you need in natural language — "Download all invoices", "Monitor flight prices" — and the agent handles the rest, end to end.
*   **Self-Healing Workflows**: Web UI changed? The agent uses visual understanding to automatically repair execution paths. Learn once, reuse forever.
*   **Chrome Lossless Experience**: Retains the full Chrome experience. Import your bookmarks, history, and passwords — continue browsing without interruption.

### 2. Decentralized & Private
*   **Freedom of Choice**: Freely switch between LLMs. Supports mainstream cloud models and fully **local LLMs** — your data never leaves your machine.
*   **Always-On, Everywhere**: ocbot runs on your desktop and can be commanded remotely via mobile browsers or IM apps. Your personal agent, always reachable.

### 3. Crypto Economy (Planned)
*   **Crypto Economy Infrastructure**: Built to support agent-to-agent micro-transactions and on-chain settlement — the financial layer for autonomous agents.
*   **Wallet-Native**: Integrated crypto wallet for seamless interaction with dApps, DeFi protocols, and agent payment networks.

---

## Development

### Quick Start

```bash
# Clone with submodule (ocbot_agent)
git clone --recursive https://github.com/instry/ocbot.git

# If already cloned without --recursive
git submodule update --init
```

### Project Structure

```
ocbot/
├── scripts/            # Dev tooling (dev.py, build.py, run.py, etc.)
├── patches/            # Generated Chromium patches
├── plans/              # Feature plan files (source of truth)
├── ocbot_agent/        # AI extension (git submodule → instry/ocbot_agent)
└── docs/               # Development documentation
```

The `ocbot_agent` submodule contains the AI browser extension (Chrome Side Panel), shared with [ocbot_biz](https://github.com/instry/ocbot_biz). It is built automatically during `dev.py build`.

### Documentation

| Doc | Description |
|-----|-------------|
| [Plan-Driven Development](docs/plan-driven-dev.md) | **The Main Guide**: Workflow, Setup, Commands, and Architecture |
| [Plans](plans/) | Feature plan files — the source of truth for each Chromium modification |
| [ocbot_agent README](ocbot_agent/README.md) | AI extension development guide |

---

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
