import { app, Menu, nativeImage, Notification, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type TrayStatus = 'running' | 'updating' | 'error'

type AppLocale = 'en' | 'zh-CN'

function normalizeSystemLocale(locale?: string | null): AppLocale {
  const normalized = (locale ?? '').trim().toLowerCase()
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return 'zh-CN'
  }
  return 'en'
}

function t(locale: AppLocale, text: string): string {
  if (locale !== 'zh-CN') {
    return text
  }

  const translations: Record<string, string> = {
    'Ocbot is still running': 'Ocbot 仍在运行',
    'Ocbot is running in the background. Click the menu bar icon to reopen.': 'Ocbot 正在后台运行。点击菜单栏图标可重新打开。',
    '\u25CF Ocbot is running': '\u25CF Ocbot 正在运行',
    '\u25D0 Ocbot is updating...': '\u25D0 Ocbot 正在更新...',
    '\u25CB Ocbot runtime error': '\u25CB Ocbot 运行时错误',
    'Open Ocbot': '打开 Ocbot',
    'Quit Ocbot': '退出 Ocbot',
  }

  return translations[text] ?? text
}

/**
 * System tray icon and menu.
 * Replaces C++ OcbotStatusIcon (~300 lines) with ~60 lines of TypeScript.
 */
export class TrayManager {
  private tray: Tray | null = null
  private status: TrayStatus = 'running'
  private runtimeVersion: string | null = null
  private didShowBackgroundNotice = false
  private readonly locale: AppLocale
  private readonly onOpen: () => void

  constructor(onOpen: () => void) {
    this.locale = normalizeSystemLocale(app.getLocale())
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
      title: t(this.locale, 'Ocbot is still running'),
      body: t(this.locale, 'Ocbot is running in the background. Click the menu bar icon to reopen.'),
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
      running: t(this.locale, '\u25CF Ocbot is running'),
      updating: t(this.locale, '\u25D0 Ocbot is updating...'),
      error: t(this.locale, '\u25CB Ocbot runtime error'),
    }

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: statusLabels[this.status], enabled: false },
      { type: 'separator' },
      { label: t(this.locale, 'Open Ocbot'), click: () => this.onOpen() },
      { type: 'separator' },
    ]

    if (this.runtimeVersion) {
      template.push(
        { label: `Runtime: v${this.runtimeVersion}`, enabled: false },
        { type: 'separator' },
      )
    }

    template.push({ label: t(this.locale, 'Quit Ocbot'), click: () => app.quit() })

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
