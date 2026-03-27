import { app, shell } from 'electron'
import { RuntimeManager } from './runtime-manager'
import { TrayManager } from './tray'
import { WindowManager } from './window'

let runtimeManager: RuntimeManager
let windowManager: WindowManager
let trayManager: TrayManager

app.on('ready', async () => {
  runtimeManager = new RuntimeManager()

  // Start gateway first, then create UI
  let port: number
  try {
    port = await runtimeManager.start()
  } catch (err) {
    console.error('Failed to start OpenClaw gateway:', err)
    // Still create window — will show error or retry
    port = 18789
  }

  windowManager = new WindowManager(port)
  trayManager = new TrayManager(() => windowManager.showOrCreate())

  if (runtimeManager.status === 'running') {
    trayManager.setStatus('running')
  } else {
    trayManager.setStatus('error')
  }

  windowManager.showOrCreate()
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
