import { app, BrowserWindow, shell } from 'electron'
import { RuntimeManager } from './runtime-manager.js'
import { TrayManager } from './tray.js'
import { WindowManager } from './window.js'

const GATEWAY_PORT = 18789

let runtimeManager: RuntimeManager
let windowManager: WindowManager
let trayManager: TrayManager

app.on('ready', async () => {
  runtimeManager = new RuntimeManager(GATEWAY_PORT)
  windowManager = new WindowManager(GATEWAY_PORT)
  trayManager = new TrayManager(() => windowManager.showOrCreate())

  // Start gateway
  try {
    await runtimeManager.start()
    trayManager.setStatus('running')
  } catch (err) {
    console.error('Failed to start OpenClaw gateway:', err)
    trayManager.setStatus('error')
  }

  // Open main window
  windowManager.showOrCreate()
})

// Keep running when all windows are closed
app.on('window-all-closed', (e: Event) => {
  // Don't quit — gateway keeps running in background
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
