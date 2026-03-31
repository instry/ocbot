import { app, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { RuntimeManager } from './runtime-manager'
import { TrayManager } from './tray'
import { WindowManager, wasOpenedAtStartup } from './window'

/** Resolve the app icon path (logo.png works on all platforms). */
function appIconPath(): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, 'icons', 'logo.png')
}

let runtimeManager: RuntimeManager
let windowManager: WindowManager
let trayManager: TrayManager

if (!app.isPackaged && process.env.TRAE_SANDBOX_CLI_PATH) {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
  app.disableHardwareAcceleration()
}

app.on('ready', async () => {
  // Set Dock icon on macOS (replaces default Electron icon)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath()))
  }

  runtimeManager = new RuntimeManager()
  await runtimeManager.prepareGatewayConnection().catch((err) => {
    console.error('Failed to prepare OpenClaw gateway connection:', err)
    return null
  })

  windowManager = new WindowManager(runtimeManager.gatewayPort ?? 18789, appIconPath(), runtimeManager)
  trayManager = new TrayManager(() => windowManager.showOrCreate())
  trayManager.setStatus(runtimeManager.status === 'not_installed' ? 'error' : 'updating')

  if (!wasOpenedAtStartup()) {
    windowManager.showOrCreate()
  }

  void runtimeManager.start()
    .then(() => {
      trayManager.setStatus('running')
    })
    .catch((err) => {
      console.error('Failed to start OpenClaw gateway:', err)
      trayManager.setStatus('error')
    })
})

// Keep running when all windows are closed
app.on('window-all-closed', () => {
  // Don't quit — gateway keeps running in background
  trayManager?.notifyBackgroundRunning()
})

app.on('before-quit', () => {
  runtimeManager?.stop()
})

// macOS: re-open window on dock icon click
app.on('activate', () => {
  windowManager?.showOrCreate()
})

// Open external links in default browser
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })
})
