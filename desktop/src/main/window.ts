import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

/**
 * Manages the main application window.
 * Loads the OpenClaw Gateway Control UI.
 */
export class WindowManager {
  private window: BrowserWindow | null = null
  private readonly port: number

  constructor(port: number) {
    this.port = port
    this.registerIPC()
  }

  showOrCreate(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return
    }
    this.createWindow()
  }

  private createWindow(): void {
    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 480,
      minHeight: 400,
      title: 'Ocbot',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 16, y: 16 },
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    this.window.loadURL(`http://127.0.0.1:${this.port}/`)

    this.window.on('closed', () => {
      this.window = null
    })
  }

  private registerIPC(): void {
    ipcMain.on('window-minimize', () => {
      this.window?.minimize()
    })
    ipcMain.on('window-maximize', () => {
      if (this.window?.isMaximized()) {
        this.window.unmaximize()
      } else {
        this.window?.maximize()
      }
    })
    ipcMain.on('window-close', () => {
      this.window?.close()
    })
  }
}
