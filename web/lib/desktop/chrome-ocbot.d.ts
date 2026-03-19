// Type declarations for the chrome.ocbot.* extension API
// These APIs are implemented in Chromium C++ (ocbot_api.mm on macOS)

declare namespace chrome.ocbot {
  interface PermissionStatus {
    supported: boolean
    accessibility?: boolean
    screenRecording?: boolean
  }

  interface AppInfo {
    name: string
    pid: number
    bundleId: string
    frontmost: boolean
  }

  interface CommandResult {
    stdout: string
    stderr: string
    exitCode: number
  }

  interface AppleScriptResult {
    result: string
  }

  interface FileEntry {
    name: string
    type: string
    size: number
  }

  interface TreeNode {
    nodeId: number
    role: string
    name?: string
    value?: string
    x?: number
    y?: number
    width?: number
    height?: number
    children?: TreeNode[]
  }

  interface DesktopTree {
    appName: string
    pid: number
    root: TreeNode
  }

  interface ClipboardContent {
    text: string
  }

  interface ScreenshotResult {
    dataUrl: string
    width: number
    height: number
  }

  function checkPermissions(callback: (status: PermissionStatus) => void): void
  function requestPermission(permissionType: string, callback: () => void): void
  function captureScreen(maxWidth: number | undefined, callback: (result: ScreenshotResult) => void): void
  function captureWindow(pid: number, maxWidth: number | undefined, callback: (result: ScreenshotResult) => void): void
  function click(x: number, y: number, callback: () => void): void
  function doubleClick(x: number, y: number, callback: () => void): void
  function rightClick(x: number, y: number, callback: () => void): void
  function mouseMove(x: number, y: number, callback: () => void): void
  function scroll(x: number, y: number, deltaX: number, deltaY: number, callback: () => void): void
  function type(text: string, callback: () => void): void
  function pressKey(key: string, modifiers: number | undefined, callback: () => void): void
  function runCommand(command: string, cwd: string | undefined, timeout: number | undefined, callback: (result: CommandResult) => void): void
  function runAppleScript(script: string, callback: (result: AppleScriptResult) => void): void
  function getDesktopTree(pid: number | undefined, callback: (tree: DesktopTree) => void): void
  function listApps(callback: (apps: AppInfo[]) => void): void
  function getActiveApp(callback: (app: AppInfo) => void): void
  function launchApp(appName: string, callback: () => void): void
  function getClipboard(callback: (content: ClipboardContent) => void): void
  function setClipboard(text: string, callback: () => void): void
  function readFile(path: string, callback: (content: string) => void): void
  function writeFile(path: string, content: string, callback: () => void): void
  function listDir(path: string, callback: (entries: FileEntry[]) => void): void
}
