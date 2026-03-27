import { BrowserWindow } from 'electron'
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
        preload: join(import.meta.dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    this.window.loadURL(`http://127.0.0.1:${this.port}/`)

    this.window.on('closed', () => {
      this.window = null
    })
  }
}
