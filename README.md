# ocbot - Web4 Browser

## **[https://oc.bot](https://oc.bot)**

---

**ocbot** is the browser built for **Web 4.0** — an open-source, AI-native browser where intelligent agents are first-class citizens. Think of it as **Chrome + Gemini**, open-sourced and reimagined for the agentic internet.

---

## What is Web4?

Web 4.0 is the next paradigm of the internet, defined by three pillars:

### Agentic — AI as a First-Class Citizen

The internet's audience is shifting from humans to **AI Agents**. UI is no longer the core — **structured data (APIs & Markdown)** becomes the new infrastructure. Social interaction evolves into millisecond-level matching between agents for hyper-efficient communication; e-commerce transforms into agent-driven, automated intelligence.

### Decentralized — Compute Equity & Sovereignty Reclaimed

Breaking the monopoly of big tech and influencers over the internet. Web 4.0 is the era of equity — information flow returns from "spoon-fed" feeds to **autonomous retrieval**. Media is power, and decentralization returns that power to the individual.

### Crypto-Native — The Settlement Protocol for Machines

Crypto is the economic lifeblood of the AI era. As digital-native entities, AI Agents conduct high-frequency, micro-value transactions that can only settle on crypto networks. Web 4.0 will witness the deep fusion of the AI economy with crypto protocols, building a new financial system.

---

## Key Features

### 1. AI Browser
*   **Open Source Chrome + Gemini**: AI capabilities are deeply integrated into the browser kernel, not just as a plugin.
*   **Freedom of Choice**: Freely switch between Large Language Models (LLMs). Supports mainstream cloud models as well as fully **local LLMs**, ensuring data privacy and control.
*   **Chrome Lossless Experience**: Retains the full Chrome experience. Easily import your Chrome data (bookmarks, history, passwords) and continue browsing without interruption.

### 2. AI Assistant
*   **OpenClaw-like Experience**: ocbot runs not only on your desktop but can also be interacted with remotely via mobile browsers or third-party IM apps.
*   **Always On**: Command your home browser to handle complex tasks remotely, wherever you are.
*   **Mobile Version**: Access ocbot on iOS/Android with a native Chrome-like experience. Sync your tabs and history seamlessly across devices.

### 3. RPA Killer
Achieve web automation with natural language—no coding required:
*   **Natural Language Control**: Simply tell the browser "Download all invoices" or "Monitor flight prices".
*   **Learn Once, Reuse Often**: After learning an operation flow once, AI converts it into an efficient execution path, **significantly saving Token costs** for future runs.
*   **Self-Healing**: Web UI changed? The AI uses visual understanding to automatically repair operation paths, ensuring continuous stable operation.

---

## Quick Start

### Option 1: Quick View (Tarball)
*For code preview only (Fast, ~20 mins).*
```bash
python scripts/dev.py download --method tarball
python scripts/dev.py patch
```

### Option 2: Full Development (Depot Tools)
*For building and contributing (Slow, ~2 hours).*
```bash
# 1. Setup Depot Tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:$(pwd)/depot_tools"

# 2. Download & Build
python scripts/dev.py download --method depot --no-history
python scripts/dev.py patch
python scripts/dev.py build
python scripts/dev.py run
```

> **Tip:** Run `python scripts/dev.py check` for auto-recommendation.

---

## Development

| Doc | Description |
|-----|-------------|
| [Development Workflow](docs/development.md) | Patch-based dev workflow, branching strategy |
| [Plan-Driven Development](docs/plan-driven-dev.md) | How we use plan files for AI-assisted development and Chromium version upgrades |
| [Plans](plans/) | Feature plan files — the source of truth for each Chromium modification |

---

## Common Commands

```bash
# Download
python scripts/dev.py download --method tarball                 # Quick download
python scripts/dev.py download --method depot --no-history      # Full download

# Patch
python scripts/dev.py patch                                  # Apply all patches

# Update Patches
python scripts/dev.py update_patches                         # Generate patches from source

# Build
python scripts/dev.py build                                  # Build Browser

# Run
python scripts/dev.py run                                    # Run with extension loaded

# Help
python scripts/dev.py --help
python scripts/dev.py download --help
```

---

## Project Structure

```
ocbot/
├── docs/                       # Documentation
├── plans/                      # Feature plans (intent + logic for each patch set)
├── extension/                  # Chrome Extension (WXT + React)
├── patches/
│   └── v144/                   # Chromium patches for current version
├── scripts/                    # Build Scripts
│   └── dev.py                  # Main CLI Tool
│
chromium/                       # Chromium Source Directory
└── <version>/src/              # Patched source tree
```

---

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
