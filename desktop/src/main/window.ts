import { app, BrowserWindow, ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { installSkill, uninstallSkill } from './skill-installer'

/**
 * Manages the main application window.
 * Loads the OpenClaw Gateway Control UI.
 */
export class WindowManager {
  private window: BrowserWindow | null = null
  private readonly port: number
  private readonly iconPath: string
  private readonly brandCSS: string

  constructor(port: number, iconPath: string) {
    this.port = port
    this.iconPath = iconPath
    this.brandCSS = this.loadBrandCSS()
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
      width: 1440,
      height: 960,
      minWidth: 480,
      minHeight: 400,
      title: 'Ocbot',
      icon: this.iconPath,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 16, y: 16 },
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Inject brand CSS as soon as the Control UI DOM is ready
    this.window.webContents.on('dom-ready', () => {
      if (this.brandCSS) {
        this.window?.webContents.insertCSS(this.brandCSS)
      }
    })

    // Load local renderer HTML instead of gateway Control UI
    this.window.loadFile(join(__dirname, '..', 'renderer', 'index.html'))

    this.window.on('closed', () => {
      this.window = null
    })
  }

  private loadBrandCSS(): string {
    try {
      // In dev: src/renderer/branding/brand.css relative to project root
      // In prod: bundled alongside the app
      const candidates = app.isPackaged
        ? [join(process.resourcesPath, 'branding', 'brand.css')]
        : [join(app.getAppPath(), 'src', 'renderer', 'branding', 'brand.css')]
      for (const p of candidates) {
        try {
          return readFileSync(p, 'utf8')
        } catch { /* try next */ }
      }
    } catch { /* ignore */ }
    return ''
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

    // Skill install/uninstall
    ipcMain.handle('skill:install', async (_event, slug: string, version?: string) => {
      return installSkill(slug, version ?? '')
    })
    ipcMain.handle('skill:uninstall', async (_event, slug: string) => {
      return uninstallSkill(slug)
    })
  }
}
