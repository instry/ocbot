# Ocbot Desktop — Architecture Overview

Status: Draft
Branch: `feat/desktop`
Date: 2026-03-27

---

## 1. Background

Ocbot 当前基于 Chromium 内核修改，存在以下瓶颈：

- **编译慢**：全量构建 45min ~ 4.5h
- **升级难**：Chromium 大版本升级 patch 冲突量巨大
- **门槛高**：C++ 内核开发效率低
- **包太大**：Chromium 二进制 + Node.js + OpenClaw

本质上，Ocbot 用了最重的方案（修改 Chromium 内核）来做一个"Gateway 管理器 + Web UI 壳"。

## 2. Product Split

Ocbot 拆分为两个产品线，共存于同一仓库的不同目录：

| 产品 | 技术栈 | 目标用户 | 状态 |
|------|--------|---------|------|
| **Ocbot Desktop** | Electron + TypeScript | 普通用户，想简单用 OpenClaw | 🔨 Active |
| **Ocbot Browser** | Chromium fork + C++ | 开发者/Web4 玩家，需要内核级控制 | ⏸ Maintenance |

Desktop 是当前开发重心。Browser 保留现有代码，后续按需维护。

## 3. Repo Structure

```
ocbot/                              ← 仓库根目录
├── desktop/                        ← 🆕 Electron 桌面应用
│   ├── package.json
│   ├── electron-builder.yml
│   ├── src/
│   │   ├── main/                   ← Electron 主进程
│   │   │   ├── index.ts            ← 入口
│   │   │   ├── runtime-manager.ts  ← Gateway 生命周期管理
│   │   │   ├── runtime-updater.ts  ← OTA 热更新
│   │   │   ├── tray.ts             ← 系统托盘
│   │   │   ├── window.ts           ← 窗口管理
│   │   │   ├── global-hotkey.ts    ← 全局热键
│   │   │   └── onboarding.ts       ← 首次启动引导
│   │   ├── preload/
│   │   │   └── index.ts            ← contextBridge
│   │   └── renderer/               ← 定制 UI 层
│   │       ├── onboarding/         ← 首次启动向导页面
│   │       └── branding/           ← 品牌覆盖 CSS
│   └── resources/
│       └── icons/                  ← 应用图标 (icns/ico/png)
│
├── browser/                        ← Ocbot Browser 产品 (Chromium fork)
│   ├── chromium/                   ← 源码 + patches
│   ├── scripts/                    ← dev.py, build.py 等
│   └── web/                        ← WXT 浏览器扩展
│
├── docs/
│   └── ocbot-desktop-architecture.md  ← 本文档
├── VERSION
├── LICENSE
└── README.md
```

**关键原则：**
- `desktop/` 和 `browser/` 是两个独立产品，互不依赖
- `desktop/` 是完全独立的 Node.js 项目，有自己的 `package.json`
- `browser/` 内含 Chromium patches、构建脚本、WXT 扩展（维护模式）
- Desktop 依赖 OpenClaw 作为外部项目（`../openclaw/`），不依赖 `browser/`

## 4. Architecture

```
┌───────────────────────────────────────────────────────┐
│  Ocbot Desktop (Electron)                              │
│                                                        │
│  ┌─ Main Process (Node.js) ─────────────────────────┐ │
│  │                                                   │ │
│  │  RuntimeManager                                   │ │
│  │  ├─ 启动 OpenClaw Gateway (子进程)                 │ │
│  │  ├─ 健康检查 (HTTP poll + process alive)           │ │
│  │  ├─ 崩溃自动重启                                   │ │
│  │  └─ 优雅关闭                                       │ │
│  │                                                   │ │
│  │  RuntimeUpdater                                   │ │
│  │  ├─ 检查 CDN 最新版本 (latest.json)                │ │
│  │  ├─ 下载 + SHA256 校验 + 解压                      │ │
│  │  ├─ 写入 pending-update.json                       │ │
│  │  └─ 下次启动时 RuntimeManager 应用更新              │ │
│  │                                                   │ │
│  │  WindowManager                                    │ │
│  │  ├─ 主窗口 (BrowserWindow → Gateway Control UI)   │ │
│  │  └─ 窗口状态持久化 (位置/大小)                      │ │
│  │                                                   │ │
│  │  TrayManager                                      │ │
│  │  ├─ 系统托盘图标 + 菜单                            │ │
│  │  └─ 关窗不退出 (后台常驻)                           │ │
│  │                                                   │ │
│  │  OnboardingManager                                │ │
│  │  └─ 检测首次启动 → 触发引导流程                     │ │
│  └───────────────────────────────────────────────────┘ │
│                                                        │
│  ┌─ Renderer Process ───────────────────────────────┐ │
│  │                                                   │ │
│  │  Gateway Control UI (Lit 3, 由 OpenClaw 提供)     │ │
│  │  ├─ Chat / Sessions / Agents / Skills / Cron      │ │
│  │  ├─ Channels Config (可视化配置)                   │ │
│  │  ├─ Models / Providers (LLM 管理)                 │ │
│  │  └─ WebSocket ──→ localhost:18789                 │ │
│  │                                                   │ │
│  │  + Ocbot 定制 (preload / CSS inject)              │ │
│  │  ├─ Onboarding Wizard (首次启动)                   │ │
│  │  ├─ 品牌化 (Logo/主题色/标题)                      │ │
│  │  └─ 导航简化 (隐藏高级选项)                        │ │
│  └───────────────────────────────────────────────────┘ │
│                                                        │
│  ┌─ OpenClaw Gateway (子进程) ──────────────────────┐ │
│  │  node openclaw.mjs gateway run                    │ │
│  │    --port 18789 --bind loopback --force            │ │
│  │                                                   │ │
│  │  ├─ WebSocket RPC (config/models/channels/chat)   │ │
│  │  ├─ Control UI HTTP 静态资源                       │ │
│  │  ├─ Channel 连接管理                               │ │
│  │  ├─ Agent 运行时                                   │ │
│  │  └─ LLM Routing                                   │ │
│  └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

## 5. Key Design Decisions

### 5.1 Gateway 进程模型：子进程

Gateway 作为 Electron 的子进程运行，而非 in-process import。

**理由：**
- **隔离性**：Gateway 崩溃不影响 UI，可自动重启
- **OTA**：停旧进程 → 换文件 → 起新进程，简单可靠
- **Node 版本**：OpenClaw 要求 Node >= 22.16，独立 Node 二进制不受 Electron 内置版本限制
- **已验证**：现有 C++ RuntimeManager 就是这个模型，直接翻译为 TypeScript

内嵌 Node.js 二进制放在 app resources 中（~70MB），和 Browser 版方案一致。

### 5.2 UI 策略：直接加载 Gateway Control UI

**不再维护独立的 `web/` 扩展 UI。**

现在 `web/` 的 views（chat, sessions, channels, settings, skills, models）本质上是 OpenClaw Control UI 的子集重写。Electron 主窗口直接加载 Gateway 提供的 Control UI：

```typescript
mainWindow.loadURL('http://localhost:18789/')
```

Ocbot 的定制通过以下方式叠加：
- **preload script**：注入 `window.ocbot` API（版本信息、native 能力）
- **CSS 注入**：品牌色、Logo 替换
- **Onboarding 拦截**：首次启动时加载本地 Wizard 页面而非 Control UI

**好处：**
- OpenClaw 更新 UI → Ocbot Desktop 自动受益，零维护成本
- Control UI 已有完整功能：Chat、Channels、Config Form、Sessions 等
- 减少 ~3000 行 web/ 代码维护

### 5.3 Onboarding Wizard

首次启动引导是 Ocbot Desktop 的核心差异化。用户不需要懂 CLI 或编辑 JSON。

**流程：**

```
Welcome → Choose LLM Provider → Enter API Key (验证) → Connect Channel (可跳过) → Done → Chat
```

**实现：**
- Wizard 是一组本地 HTML 页面，通过 Electron IPC 与 Main Process 通信
- Main Process 调用 Gateway RPC (`config.set`) 写入配置
- API Key 验证：调用 `models.list` 确认 provider 可用
- Channel 配置：引导式 UI，一步步教用户获取 Token
- 完成后 `loadURL` 切换到 Control UI

### 5.4 系统托盘 + 后台常驻

```typescript
// Electron 原生，替代 C++ OcbotStatusIcon (~300 行) + KeepAlive
app.on('window-all-closed', (e) => e.preventDefault())

const tray = new Tray(iconPath)
tray.setContextMenu(Menu.buildFromTemplate([
  { label: '● Ocbot is running', enabled: false },
  { type: 'separator' },
  { label: 'Open Ocbot', click: () => createOrFocusWindow() },
  { type: 'separator' },
  { label: `Runtime: v${runtimeVersion}`, enabled: false },
  { type: 'separator' },
  { label: 'Quit Ocbot', click: () => app.quit() }
]))
```

首次关窗时弹通知："Ocbot 仍在后台运行"（`Notification` API，一行代码）。

### 5.5 全局热键

双击空格检测需要 native 键盘监听，Electron `globalShortcut` 不支持序列。

**v1 方案：** 使用标准快捷键 `Cmd+Shift+Space`（macOS）/ `Ctrl+Shift+Space`（Windows）。
**v2 方案：** 如仍需双击空格，引入 `node-global-key-listener` npm 包。

### 5.6 OTA 热更新

复用现有的 split-layer 方案（Base Layer + App Layer），从 C++ 翻译为 TypeScript：

| 组件 | C++ 原版 | TypeScript 新版 |
|------|---------|----------------|
| 检查更新 | `SimpleURLLoader` | `electron net.request` 或 `fetch` |
| 下载文件 | `SimpleURLLoader` | `electron net.request` + stream |
| SHA256 校验 | `crypto::SecureHash` | `crypto.createHash('sha256')` |
| 解压 tar.gz | `base::LaunchProcess(tar)` | `tar.x()` (tar npm 包) 或 spawn tar |
| 符号链接切换 | `symlink()` + `rename()` | `fs.symlink()` + `fs.rename()` |
| pending 标记 | `WriteJsonFile()` | `fs.writeFile()` |

目录布局和 `latest.json` 格式完全不变，与 Browser 版兼容。

## 6. Migration Map

从 Chromium C++ 到 Electron TypeScript 的逐项映射：

| 现有组件 | 代码量 | 新实现 | 预估代码量 | 备注 |
|---------|-------|--------|-----------|------|
| RuntimeManager (C++) | ~500 行 | `runtime-manager.ts` | ~150 行 | 子进程管理 + 健康检查 |
| RuntimeUpdater (C++) | ~600 行 | `runtime-updater.ts` | ~200 行 | 下载 + 校验 + 解压 |
| OcbotStatusIcon (ObjC/C++) | ~300 行 | `tray.ts` | ~50 行 | Electron Tray API |
| OcbotGlobalHotkey (ObjC/C++) | ~150 行 | `global-hotkey.ts` | ~30 行 | globalShortcut |
| KeepAlive (C++) | ~30 行 | 1 行 | 1 行 | `window-all-closed` |
| Component Extension 加载 | ~80 行 | `loadURL()` | 1 行 | 直接加载 Gateway |
| Tab Strip Button (C++) | ~200 行 | 删除 | 0 | 不是浏览器，不需要 |
| Side Panel 逻辑 (C++) | ~100 行 | 删除 | 0 | 主窗口就是 UI |
| SW Permanent Keepalive (C++) | ~40 行 | 删除 | 0 | Gateway 是进程 |
| Branding (grd/strings) | 数千行 patch | electron-builder.yml | ~20 行 | 产品名/图标配置 |
| `web/` WXT Extension | ~3000 行 TS | 大幅精简 | ~500 行 | 仅保留 Onboarding + 品牌 |
| BUILD.gn 修改 | 多处 | package.json | — | npm 生态 |

**总计：~2000+ 行 C++/ObjC → ~500 行 TypeScript**

## 7. Directory Layout (Runtime)

用户机器上的文件布局，与 Browser 版保持一致：

```
~/Library/Application Support/Ocbot/       (macOS)
%APPDATA%/Ocbot/                           (Windows)

├── openclaw-config/
│   └── openclaw.json                       ← Gateway 配置
├── runtime/
│   ├── base/
│   │   ├── current → versions/base-YYYY.M.D/
│   │   └── versions/
│   │       └── base-YYYY.M.D/             (node_modules/)
│   ├── app/
│   │   ├── current → versions/app-YYYY.M.D/
│   │   ├── previous → versions/app-YYYY.M.D-old/
│   │   └── versions/
│   │       └── app-YYYY.M.D/              (openclaw.mjs, dist/, ...)
│   ├── staging/                            (下载临时目录)
│   ├── pending-update.json
│   └── update-manifest.json
└── workspace/                              ← OpenClaw workspace
    ├── skills/
    └── .clawhub/
```

## 8. Environment Variables

Gateway 子进程启动时设置（与 Browser 版保持一致）：

| 变量 | 用途 | 值 |
|------|------|---|
| `OPENCLAW_CONFIG_PATH` | 配置文件路径 | `<app-support>/Ocbot/openclaw-config/openclaw.json` |
| `OPENCLAW_STATE_DIR` | 状态目录 | `<app-support>/Ocbot/openclaw-config/` |
| `OPENCLAW_BUNDLED_PLUGINS_DIR` | 内置插件目录 | `<resources>/openclaw/extensions/` |
| `OPENCLAW_NO_RESPAWN` | 阻止 OpenClaw 自行 fork | `1` |
| `NODE_PATH` | OTA base layer 的 node_modules | `<runtime>/base/current/node_modules/` |

## 9. Tech Stack

| 层 | 技术 | 版本要求 |
|---|------|---------|
| Shell | Electron | Latest stable |
| Main Process | TypeScript + Node.js | (Electron 内置) |
| Renderer | OpenClaw Control UI (Lit 3) | (由 Gateway 提供) |
| Onboarding UI | HTML + CSS + TS | (本地页面) |
| Runtime | OpenClaw Gateway | Node.js >= 22.16 (内嵌二进制) |
| 打包 | electron-builder | — |
| OTA (Electron) | electron-updater | — |
| OTA (Runtime) | 自定义 split-layer | 复用现有方案 |

## 10. Implementation Phases

### Phase 1 — Skeleton + Gateway 启动

- [ ] 初始化 Electron 项目 (`desktop/`)
- [ ] RuntimeManager：启动/停止 Gateway 子进程
- [ ] WindowManager：主窗口加载 `http://localhost:18789/`
- [ ] 基本系统托盘 + 后台常驻
- [ ] `dev` 脚本：开发模式下直接使用系统 `openclaw` 或 `../openclaw`

**验证：** 启动 Ocbot Desktop → Gateway 自动运行 → 主窗口显示 Control UI → 关窗不退出

### Phase 2 — Onboarding Wizard

- [ ] 首次启动检测（无 `openclaw.json` 或无 provider 配置）
- [ ] LLM Provider 选择页（Anthropic / OpenAI / Ollama / 更多）
- [ ] API Key 输入 + 在线验证
- [ ] Channel 连接引导（Telegram / Discord，可跳过）
- [ ] 完成后切换到 Control UI

**验证：** 首次启动 → Wizard 引导 → 配置写入 → 直接可用 Chat

### Phase 3 — 打包 + 内嵌 Runtime

- [ ] electron-builder 配置（macOS DMG / Windows NSIS）
- [ ] 内嵌 Node.js 二进制
- [ ] 内嵌 OpenClaw Runtime（Base + App Layer）
- [ ] 应用签名 + 公证（macOS）
- [ ] 品牌化（图标、产品名、Bundle ID）

**验证：** 构建 DMG → 安装 → 无需任何依赖即可运行

### Phase 4 — OTA 热更新

- [ ] RuntimeUpdater：检查 latest.json → 下载 → 校验 → 解压
- [ ] RuntimeManager：启动时应用 pending update
- [ ] electron-updater：Electron shell 自身更新
- [ ] 回滚机制

**验证：** 发布新 runtime 版本 → 应用自动下载更新 → 下次启动生效

### Phase 5 — Polish

- [ ] 全局热键 (`Cmd+Shift+Space`)
- [ ] 首次关窗通知
- [ ] 窗口位置/大小记忆
- [ ] 错误处理和用户提示（Gateway 启动失败、端口占用等）
- [ ] 自动启动（开机启动选项）

## 11. What Lives Where

Browser 产品的代码全部在 `browser/` 目录下：

- `browser/chromium/` — Chromium 源码和 patches
- `browser/scripts/` — Chromium 构建/发布脚本 (dev.py, build.py, patch.py 等)
- `browser/web/` — WXT 浏览器扩展

Desktop 产品不使用以上任何代码。

## 12. Open Questions

1. **Electron Node.js 版本**：当前 Electron stable 内置 Node 22.x，如果 >= 22.16 可以考虑 in-process import Gateway（省掉内嵌 Node.js），但 v1 先用子进程模式
2. **Control UI 定制深度**：preload + CSS 注入够用吗？还是需要 fork Control UI？待 Phase 1 验证后决定
3. **OpenClaw 依赖方式**：开发时 `../openclaw`，生产时内嵌 bundle。是否需要 npm 包形式？
4. **双击空格热键**：v1 先用标准快捷键，v2 再评估是否需要 native 键盘监听
