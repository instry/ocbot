<p align="center">
  <img src="octopus.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - AI Browser & Assistant

**ocbot** is an open-source, AI-native and OpenClaw Friendly browser. It can be used as a standalone AI Agent or seamlessly integrated with OpenClaw.

---

## Key Features

*   **AI-Native & OpenClaw Friendly **: AI capabilities are deeply integrated into the browser kernel — not a plugin, but a core primitive. Your browser understands, reasons, and acts.
*   **SKILL support**: Learns new SKILLs automatically while executing tasks. Learn once, execute millions. Significantly saves tokens compared to traditional agents.
*   **Always-On, Everywhere**: ocbot runs on your desktop and can be commanded remotely via mobile browsers or IM apps. Your personal agent, always reachable.
*   **Self-Healing Workflows**: Web UI changed? The agent uses visual understanding to automatically repair execution paths.
*   **Chrome Lossless Experience**: Retains the full Chrome experience. Import your bookmarks, history, and passwords — continue browsing without interruption.
*   **Freedom of Choice & Priviacy protect**: Freely switch between LLMs. Supports mainstream cloud models and fully **local LLMs** — your data never leaves your machine.

---

## Development

### Prerequisites

- macOS / Linux (Windows untested)
- Python 3
- Node.js + npm (for extension build)
- [Depot Tools](https://chromium.googlesource.com/chromium/tools/depot_tools.git) (for full build)

### Getting Started

```bash
# 1. Clone with submodule (ocbot_agent)
git clone --recursive https://github.com/instry/ocbot.git

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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
