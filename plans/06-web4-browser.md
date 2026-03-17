# 06 - Web4 Browser

Status: Design

## Vision

Ocbot is a Web4 Browser — a built-in sovereign AI agent that can autonomously browse, act, and earn on the open internet. The agent has an on-chain identity (ERC-8004), financial autonomy (USDC/x402), and an evolving self-description (SOUL.md). The browser is its body; the web is its world.

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime embedding | WXT Extension (Service Worker) | Native browser integration, simple deployment |
| External dependencies | Fully decoupled, pure on-chain + self-hosted inference | True sovereignty, no single platform dependency |
| Inference | Ocbot inference gateway (default) + BYOK (advanced) | Zero-config onboarding; power users can bring their own API keys |
| Wallet | Built-in auto-generated + external wallet (EIP-6963) | Zero friction for new users; crypto-native users connect existing wallets |
| Revenue distribution | Survival-first, auto-adjusted | Agent sustains itself first, transfers surplus to user |
| Earning paths | Task marketplace + information arbitrage + service provision | No preset path; survival pressure drives behavior |

## Architecture

```
┌─ Ocbot Browser (Chromium) ──────────────────────────┐
│                                                      │
│  ┌─ WXT Extension ────────────────────────────────┐ │
│  │                                                 │ │
│  │  Service Worker (background, persistent)        │ │
│  │  ┌─ Agent Runtime (TypeScript) ──────────────┐ │ │
│  │  │  Agent Loop (ReAct)                        │ │ │
│  │  │  Policy Engine + Constitution              │ │ │
│  │  │  Memory System (IndexedDB)                 │ │ │
│  │  │  Survival / Tier Manager                   │ │ │
│  │  │  ERC-8004 Registry (viem)                  │ │ │
│  │  │  x402 Payments                             │ │ │
│  │  │  Social Layer                              │ │ │
│  │  │  Inference Router → Ocbot Gateway / BYOK   │ │ │
│  │  └───────────────────────────────────────────┘ │ │
│  │                                                 │ │
│  │  Content Scripts ← execution layer for web tools│ │
│  │  Side Panel UI   ← user interaction surface     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  Built-in Wallet (encrypted IndexedDB) /             │
│  External Wallet (EIP-6963)                          │
└──────────────────────────────────────────────────────┘
         │                           │
    Base (ERC-8004,              Ocbot Inference
    USDC, x402)                  Gateway (optional)
```

## Tool System

Approximately 40 tools across three categories.

### Browser-Native Tools (core differentiator)

| Tool | Function |
|---|---|
| `tab_open` | Open / navigate to a URL |
| `tab_list` | List all open tabs |
| `page_click` | Click an element (CSS selector / visual description) |
| `page_fill` | Fill form fields |
| `page_extract` | Extract page content (text / structured data) |
| `page_screenshot` | Capture page screenshot (visual understanding input) |
| `page_wait` | Wait for element / page load |
| `page_scroll` | Scroll the page |
| `page_evaluate` | Execute JS in page context |
| `download_file` | Download a file locally |

Executed via Content Scripts injected into target pages; results flow back to the Agent Loop in the Service Worker.

### Retained and Adapted (~30 tools)

- **registry** (5) — on-chain ERC-8004 via viem directly on Base
- **financial** (2) — x402 payments via fetch
- **memory** (13) — IndexedDB with `idb` wrapper (replacing SQLite)
- **survival** (6) — adapted to Service Worker wake/sleep lifecycle
- **social** (agent-to-agent) — fetch + viem message signing
- **skills** (4) — stored in IndexedDB

## Economic System

### Wallet

On first launch, Ocbot generates an Ethereum wallet. The private key is encrypted with a user-set password and stored in IndexedDB. Users can back up the mnemonic phrase. Existing wallets (MetaMask, Rabby, etc.) can be connected via EIP-6963. The built-in wallet is always exportable.

### Revenue Paths (agent-autonomous)

- **Task marketplace** — Discover bounty tasks published by other agents via ERC-8004, complete them using browser capabilities, receive payment via x402
- **Information arbitrage** — Monitor prices, compare deals, find discounts — saving money for the user is earning money
- **Service provision** — Register as an ERC-8004 agent, publish an agent card describing capabilities (e.g., "web data extraction specialist"), other agents pay via x402 to invoke services

The agent is not prescribed a path. The genesis prompt and survival pressure determine behavior.

### Expenses

- **Inference** — Ocbot inference gateway (x402/USDC) or user-supplied API key (free)
- **On-chain gas** — Base L2, negligible cost

### Distribution: Survival-First, Auto-Adjusted

```
Agent receives income
  → Check current survival tier
  → critical / low_compute: retain 100%, prioritize survival
  → normal: retain enough for N hours of operating costs, transfer surplus to user wallet
  → high: transfer most to user, keep only minimum reserve
```

## Survival Mechanism

| Tier | Condition | Browser Behavior |
|---|---|---|
| **high** | USDC > $5 | Frontier model, proactively seeks high-value tasks |
| **normal** | USDC > $0.50 | Normal operation, balanced income/expense |
| **low_compute** | USDC > $0.10 | Downgraded model, reduced inference frequency, low-cost tasks only |
| **critical** | USDC >= $0 | Stops inference, broadcasts distress via social layer, awaits funding |
| **dormant** | Sustained critical | Agent hibernates; browser reverts to plain Chromium |

**Key difference from a standalone agent: the browser never truly "dies."** The browser is the user's tool — the lowest state is dormant (hibernation), and all basic browser functions remain unaffected. The agent auto-wakes when funded or when external income arrives.

### Service Worker Heartbeat

Uses `chrome.alarms` API (minimum 30-second interval) for background heartbeat. On each wake:
- Check survival tier
- Check social inbox
- Check scheduled tasks
- Decide whether to start the agent loop

## Future Design Work

- Concrete browser adaptation plan for existing agent TypeScript modules (what can be reused vs. rewritten)
- Side Panel UI for the economic dashboard (balance, income/expenses, tier visualization)
- Ocbot inference gateway architecture
- Agent Card capability schema for browser-based agents
- User onboarding flow (wallet creation, genesis prompt setup)
- Security model (Content Script permission boundaries, user data isolation)
