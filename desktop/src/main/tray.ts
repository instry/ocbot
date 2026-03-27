import { app, Menu, nativeImage, Notification, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type TrayStatus = 'running' | 'updating' | 'error'

/**
 * System tray icon and menu.
 * Replaces C++ OcbotStatusIcon (~300 lines) with ~60 lines of TypeScript.
 */
export class TrayManager {
  private tray: Tray | null = null
  private status: TrayStatus = 'running'
  private runtimeVersion: string | null = null
  private didShowBackgroundNotice = false
  private readonly onOpen: () => void

  constructor(onOpen: () => void) {
    this.onOpen = onOpen
    this.create()
  }

  setStatus(status: TrayStatus): void {
    this.status = status
    this.rebuildMenu()
  }

  setRuntimeVersion(version: string): void {
    this.runtimeVersion = version
    this.rebuildMenu()
  }

  /**
   * Show a notification when user closes the last window for the first time.
   */
  notifyBackgroundRunning(): void {
    if (this.didShowBackgroundNotice) return
    this.didShowBackgroundNotice = true

    new Notification({
      title: 'Ocbot is still running',
      body: 'Ocbot is running in the background. Click the menu bar icon to reopen.',
    }).show()
  }

  private create(): void {
    const icon = this.loadIcon()
    this.tray = new Tray(icon)
    this.tray.setToolTip('Ocbot')
    this.tray.on('click', () => this.onOpen())
    this.rebuildMenu()
  }

  private rebuildMenu(): void {
    if (!this.tray) return

    const statusLabels: Record<TrayStatus, string> = {
      running: '\u25CF Ocbot is running',
      updating: '\u25D0 Ocbot is updating...',
      error: '\u25CB Ocbot runtime error',
    }

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: statusLabels[this.status], enabled: false },
      { type: 'separator' },
      { label: 'Open Ocbot', click: () => this.onOpen() },
      { type: 'separator' },
    ]

    if (this.runtimeVersion) {
      template.push(
        { label: `Runtime: v${this.runtimeVersion}`, enabled: false },
        { type: 'separator' },
      )
    }

    template.push({ label: 'Quit Ocbot', click: () => app.quit() })

    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  private loadIcon(): Electron.NativeImage {
    // Try loading from resources
    const iconName = process.platform === 'darwin' ? 'tray-icon.png' : 'tray-icon.png'
    const iconPath = join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'), 'icons', iconName)

    if (existsSync(iconPath)) {
      const img = nativeImage.createFromPath(iconPath)
      if (process.platform === 'darwin') {
        // Resize for menu bar (22x22)
        return img.resize({ width: 22, height: 22 })
      }
      return img
    }

    // Fallback: empty icon
    return nativeImage.createEmpty()
  }
}
