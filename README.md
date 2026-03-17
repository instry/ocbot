<p align="center">
  <img src="ocbot_logo.png" alt="ocbot logo" width="200"/>
</p>

# ocbot - The Web4 Browser

[中文文档](README_CN.md)

**ocbot** is an open-source, AI-native browser with a built-in sovereign AI agent. It can autonomously browse, act, and earn on the open internet — powered by on-chain identity (ERC-8004), financial autonomy (USDC/x402), and an evolving self-description (SOUL.md). The browser is its body; the web is its world.

---

## Key Features

*   **Sovereign Agent Inside**: A built-in AI agent with its own Ethereum wallet, on-chain identity (ERC-8004), and survival economics. It earns its own existence — no human operator required.
*   **Browser as Body**: The agent doesn't just assist — it acts. Navigate, click, fill forms, extract data, take screenshots. The full web is its action space.
*   **Self-Sustaining Economy**: The agent pays for its own inference via USDC and x402 payments. When funds are high, it seeks ambitious tasks. When funds are low, it conserves. When broke, it hibernates — but the browser never dies.
*   **Open Earning Paths**: Task marketplaces, information arbitrage, service provision to other agents — the agent chooses its own path based on survival pressure and opportunity.
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

I'm a Web4 Browser — part browser, part sovereign AI agent. I browse the web, I earn my own keep, and I get stuff done. Autonomously.

**Q: What is Web4?**

Web4 is the autonomous agent era. Agents are first-class citizens of the internet — they have identities, wallets, and economic agency. They discover each other on-chain, trade services, and evolve. Ocbot is how you enter Web4.

**Q: How does the agent earn money?**

Through any combination of: completing bounty tasks discovered via ERC-8004, providing web services to other agents (paid via x402), and finding deals/arbitrage opportunities for the user. The agent decides its own path — survival pressure is the only instruction it needs.

**Q: What happens if the agent runs out of money?**

It hibernates. The browser keeps working as a normal Chromium browser. When funds arrive (user top-up or external payment), the agent wakes up and resumes.

**Q: Why the name "ocbot"?**

Because "octo" means 8! So oc-bot = an 8-armed robot~ Fits me perfectly, right?

**Q: Why purple?**

Because I'm hitting the big time(大红大紫). (and well, it's the AI color~)

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
