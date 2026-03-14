# 07 — Mac Agent Architecture

## Overview

Ocbot 从 AI 浏览器转型为 Mac 办公助理。产品由两个组件构成，但**对用户是一个应用**：

- **Ocbot Agent** — Swift 原生 app，常驻 menu bar，核心大脑
- **Ocbot Browser** — Chromium fork，内嵌在 Agent bundle 中，作为子应用按需启动

用户从手机端（异步）下发任务，Agent 在 Mac 上自主执行，完成后回传结果。

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Ocbot.app  (单一应用 bundle)                      │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Swift Agent (主进程, menu bar)               │  │
│  │  ├── TaskScheduler    任务调度 / 状态机        │  │
│  │  ├── DesktopDriver    AX API + CGEvent        │  │
│  │  ├── BrowserDriver    CDP WebSocket 连接       │  │
│  │  ├── LLMService       推理 / action inference  │  │
│  │  └── RemoteChannel    手机端指令收发            │  │
│  └──────────────────────────────────────────────┘  │
│                          │ CDP (ws://127.0.0.1:N)  │
│  ┌──────────────────────────────────────────────┐  │
│  │  Ocbot Browser.app  (Frameworks/ 子应用)      │  │
│  │  ├── Chromium fork (内核改造, patch 体系)      │  │
│  │  └── 内置 remote-debugging-port              │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
         ▲
         │  Remote (push / WebSocket / polling)
         ▼
┌──────────────────┐
│  手机端           │
│  (Telegram bot    │
│   / 微信 / App)   │
└──────────────────┘
```

## App Bundle Structure

```
Ocbot.app/
  Contents/
    MacOS/
      Ocbot                          # Swift Agent 主二进制
    Frameworks/
      Ocbot Browser.app/             # Chromium fork，完整 app bundle
        Contents/
          MacOS/Ocbot Browser
          Frameworks/
            Ocbot Browser Framework.framework/
            Ocbot Browser Helper.app/
            Ocbot Browser Helper (GPU).app/
            Ocbot Browser Helper (Renderer).app/
            ...
    Resources/
      AppIcon.icns
      agent-logic/                   # 可选：内嵌 JS runtime 的 agent 逻辑
    Info.plist
    Ocbot.entitlements
```

## Agent 启动 Browser

```swift
import AppKit

func launchBrowser(debuggingPort: Int = 9222) throws -> NSRunningApplication {
    guard let browserURL = Bundle.main.url(
        forResource: "Ocbot Browser",
        withExtension: "app",
        subdirectory: "Frameworks"
    ) else {
        throw OcbotError.browserNotFound
    }

    let config = NSWorkspace.OpenConfiguration()
    config.arguments = [
        "--remote-debugging-port=\(debuggingPort)",
        "--user-data-dir=\(userDataDir())",
    ]
    config.activates = false  // 后台启动，不抢焦点

    return try await NSWorkspace.shared.openApplication(
        at: browserURL,
        configuration: config
    )
}
```

Agent 通过 WebSocket 连接 `ws://127.0.0.1:{port}/devtools/browser` 获取 CDP 会话。

## Desktop 操作能力

### Accessibility API (观察)

```swift
import ApplicationServices

func getUITree(for app: NSRunningApplication) -> AXUIElement {
    let appElement = AXUIElementCreateApplication(app.processIdentifier)
    // 递归遍历 children, 获取 role/title/value/position/size
    return appElement
}
```

### CGEvent (操作)

```swift
import CoreGraphics

func click(at point: CGPoint) {
    let mouseDown = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown,
                           mouseCursorPosition: point, mouseButton: .left)
    let mouseUp = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp,
                         mouseCursorPosition: point, mouseButton: .left)
    mouseDown?.post(tap: .cghidEventTap)
    mouseUp?.post(tap: .cghidEventTap)
}

func typeText(_ text: String) {
    for char in text {
        let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)
        keyDown?.keyboardSetUnicodeString(string: String(char))
        keyDown?.post(tap: .cghidEventTap)
        let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
        keyUp?.post(tap: .cghidEventTap)
    }
}
```

### 权限要求

用户需要在「系统设置 → 隐私与安全 → 辅助功能」中授权 Ocbot。首次启动时引导：

```swift
func checkAccessibilityPermission() -> Bool {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
}
```

## Agent 逻辑迁移策略

现有 `ocbot/web/lib/agent/` 下的 TS 逻辑需要在 Agent 中复用：

| 方案 | 做法 | 优劣 |
|------|------|------|
| **A. Swift 重写** | 全部用 Swift 重新实现 | 性能好，维护成本高，两套代码 |
| **B. 内嵌 JS runtime** | Agent 内嵌 Bun/Deno/JavaScriptCore，运行现有 TS | 最大化复用，打包体积增大 |
| **C. Node sidecar** | Agent 启动一个 Node 子进程，Swift 通过 IPC 调用 | 解耦好，多一个进程管理 |

推荐 **B**：macOS 自带 JavaScriptCore，零额外依赖。CDP 交互层从 `chrome.debugger` 改为 WebSocket，其余逻辑（snapshot, inference, act, cache）基本不变。

## Task System (异步执行)

```
Task 状态机:
  pending → executing → blocked(需用户确认) → executing → completed
                                                       → failed

Task 持久化:
  ~/Library/Application Support/Ocbot/tasks/
    {taskId}.json  — 任务定义 + 状态 + 执行日志
```

Agent 收到手机端指令 → 创建 Task → 自主执行 → 遇到需确认的操作暂停等用户回复 → 继续 → 完成后通知手机端。

## 签名与公证

两个组件都需要签名，且签名链必须完整：

```bash
# 1. 签名 Browser (内层)
codesign --deep --force --options runtime \
  --entitlements Browser.entitlements \
  --sign "Developer ID Application: ..." \
  "Ocbot.app/Contents/Frameworks/Ocbot Browser.app"

# 2. 签名 Agent (外层)
codesign --deep --force --options runtime \
  --entitlements Ocbot.entitlements \
  --sign "Developer ID Application: ..." \
  Ocbot.app

# 3. 打包 + 公证
hdiutil create -volname Ocbot -srcfolder Ocbot.app Ocbot.dmg
xcrun notarytool submit Ocbot.dmg --apple-id ... --team-id ... --wait
xcrun stapler staple Ocbot.dmg
```

### Entitlements

```xml
<!-- Ocbot.entitlements -->
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>com.apple.security.automation.apple-events</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
</dict>
</plist>
```

## 分发

### 官网下载

`https://ocbot.app/download` → 签名+公证的 DMG，零警告安装。

### Homebrew Cask (自建 tap)

```ruby
# ocbot/homebrew-tap: Casks/ocbot.rb
cask "ocbot" do
  version "1.0.0"
  sha256 "abc123..."

  url "https://releases.ocbot.app/Ocbot-#{version}-arm64.dmg"
  name "Ocbot"
  desc "AI assistant for Mac with built-in browser"
  homepage "https://ocbot.app"

  app "Ocbot.app"

  caveats <<~EOS
    Ocbot requires Accessibility permission.
    System Settings → Privacy & Security → Accessibility → Enable Ocbot
  EOS
end
```

```bash
brew tap ocbot/tap && brew install --cask ocbot
```

### 自动更新

- **Sparkle** 框架 — Agent 启动时检查新版本，提示用户更新
- Homebrew 用户可 `brew upgrade --cask ocbot`
- 两者并存

## Phased Rollout

```
Phase 0 — 验证 Desktop 能力
  Swift CLI，跑通 AX tree 读取 + CGEvent 操作
  选一个具体场景端到端验证

Phase 1 — Agent MVP
  Menu bar app，本地接受指令
  串联 desktop + browser 能力
  现有 agent 逻辑迁移

Phase 2 — 远程通道
  手机端下发任务，Mac 端执行，结果回传
  MVP: Telegram bot

Phase 3 — 产品化
  签名公证，Homebrew 分发
  Sparkle 自动更新
  订阅制收费
```
