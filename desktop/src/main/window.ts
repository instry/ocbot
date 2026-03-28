import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { cancelActiveDownload, checkForAppUpdate, downloadAppUpdate, installAppUpdate, type AppUpdateAsset } from './app-update'
import { RuntimeManager } from './runtime-manager'
import { installSkill, uninstallSkill } from './skill-installer'

interface BrowserProfileInfo {
  directory: string
  name: string
  path: string
}

interface BrowserProfilesResult {
  browser: {
    kind: string
    userDataDir: string
  }
  profiles: BrowserProfileInfo[]
}

interface BrowserCandidate {
  kind: string
  userDataDir: string
}

function getBrowserCandidates(): BrowserCandidate[] {
  const home = homedir()

  if (process.platform === 'darwin') {
    const appSupport = join(home, 'Library', 'Application Support')
    return [
      { kind: 'chrome', userDataDir: join(appSupport, 'Google', 'Chrome') },
      { kind: 'brave', userDataDir: join(appSupport, 'BraveSoftware', 'Brave-Browser') },
      { kind: 'edge', userDataDir: join(appSupport, 'Microsoft Edge') },
      { kind: 'chromium', userDataDir: join(appSupport, 'Chromium') },
    ]
  }

  if (process.platform === 'linux') {
    const configDir = join(home, '.config')
    return [
      { kind: 'chrome', userDataDir: join(configDir, 'google-chrome') },
      { kind: 'brave', userDataDir: join(configDir, 'BraveSoftware', 'Brave-Browser') },
      { kind: 'edge', userDataDir: join(configDir, 'microsoft-edge') },
      { kind: 'chromium', userDataDir: join(configDir, 'chromium') },
    ]
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const localAppData = process.env.LOCALAPPDATA
    return [
      { kind: 'chrome', userDataDir: join(localAppData, 'Google', 'Chrome', 'User Data') },
      { kind: 'brave', userDataDir: join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { kind: 'edge', userDataDir: join(localAppData, 'Microsoft', 'Edge', 'User Data') },
      { kind: 'chromium', userDataDir: join(localAppData, 'Chromium', 'User Data') },
    ]
  }

  return []
}

function fallbackProfileName(directory: string): string {
  return directory === 'Default' ? 'Default' : directory
}

function sortProfileDirectories(left: string, right: string): number {
  const rank = (value: string) => {
    if (value === 'Default') return -1
    const match = /^Profile (\d+)$/.exec(value)
    if (match) return Number(match[1])
    return Number.MAX_SAFE_INTEGER
  }

  const leftRank = rank(left)
  const rightRank = rank(right)

  if (leftRank !== rightRank) return leftRank - rightRank
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function readProfileInfoCache(userDataDir: string): Record<string, string> {
  const localStatePath = join(userDataDir, 'Local State')
  if (!existsSync(localStatePath)) return {}

  try {
    const state = JSON.parse(readFileSync(localStatePath, 'utf8')) as {
      profile?: { info_cache?: Record<string, { name?: string; shortcut_name?: string; gaia_name?: string }> }
    }
    const infoCache = state.profile?.info_cache ?? {}
    return Object.fromEntries(
      Object.entries(infoCache).map(([directory, value]) => [
        directory,
        value.name || value.shortcut_name || value.gaia_name || fallbackProfileName(directory),
      ]),
    )
  } catch {
    return {}
  }
}

function listProfileDirectories(userDataDir: string, knownDirectories: string[]): string[] {
  const directories = new Set(knownDirectories)

  try {
    for (const entry of readdirSync(userDataDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (existsSync(join(userDataDir, entry.name, 'Preferences'))) {
        directories.add(entry.name)
      }
    }
  } catch {
    return Array.from(directories).sort(sortProfileDirectories)
  }

  return Array.from(directories).sort(sortProfileDirectories)
}

function scanBrowserProfiles(): BrowserProfilesResult[] {
  const results: BrowserProfilesResult[] = []

  for (const candidate of getBrowserCandidates()) {
    if (!existsSync(candidate.userDataDir)) continue

    const infoCache = readProfileInfoCache(candidate.userDataDir)
    const directories = listProfileDirectories(candidate.userDataDir, Object.keys(infoCache))
    const profiles = directories.map((directory) => ({
      directory,
      name: infoCache[directory] || fallbackProfileName(directory),
      path: join(candidate.userDataDir, directory),
    }))

    if (profiles.length === 0) continue

    results.push({
      browser: {
        kind: candidate.kind,
        userDataDir: candidate.userDataDir,
      },
      profiles,
    })
  }

  return results
}

function resolveOcbotBrowserPath(): string {
  const candidates = new Set<string>()

  if (process.platform === 'darwin') {
    candidates.add('/Applications/Ocbot.app/Contents/MacOS/Ocbot')
    candidates.add('/Applications/ocbot.app/Contents/MacOS/ocbot')

    try {
      const repoRoot = resolve(app.getAppPath(), '..')
      const version = readFileSync(join(repoRoot, 'browser', 'VERSION'), 'utf8').trim()
      const versionMap = JSON.parse(readFileSync(join(repoRoot, 'browser', 'version_map.json'), 'utf8')) as Record<string, { chromium?: string }>
      const chromiumVersion = versionMap[version]?.chromium
      const major = chromiumVersion?.split('.')[0]
      if (major) {
        candidates.add(join(repoRoot, 'browser', 'chromium', `v${major}`, 'src', 'out', 'Default', 'Ocbot.app', 'Contents', 'MacOS', 'Ocbot'))
      }
    } catch {}
  }

  if (process.platform === 'linux') {
    candidates.add('/usr/bin/ocbot')
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return ''
}

/**
 * Manages the main application window.
 * Loads the OpenClaw Gateway Control UI.
 */
export class WindowManager {
  private window: BrowserWindow | null = null
  private readonly port: number
  private readonly iconPath: string
  private readonly brandCSS: string
  private readonly runtimeManager: RuntimeManager

  constructor(port: number, iconPath: string, runtimeManager: RuntimeManager) {
    this.port = port
    this.iconPath = iconPath
    this.runtimeManager = runtimeManager
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
      console.log('[IPC] skill:install called:', slug, version)
      try {
        const result = await installSkill(slug, version ?? '')
        console.log('[IPC] skill:install result:', result)
        return result
      } catch (err) {
        console.error('[IPC] skill:install error:', err)
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    })
    ipcMain.handle('skill:uninstall', async (_event, slug: string) => {
      console.log('[IPC] skill:uninstall called:', slug)
      try {
        const result = await uninstallSkill(slug)
        console.log('[IPC] skill:uninstall result:', result)
        return result
      } catch (err) {
        console.error('[IPC] skill:uninstall error:', err)
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    })
    ipcMain.handle('browser:getProfiles', async () => scanBrowserProfiles())
    ipcMain.handle('browser:getOcbotPath', async () => resolveOcbotBrowserPath())
    ipcMain.handle('appUpdate:check', async () => checkForAppUpdate())
    ipcMain.handle(
      'appUpdate:download',
      async (event, payload: { asset: AppUpdateAsset; version: string }) => {
        const filePath = await downloadAppUpdate(payload.asset, payload.version, (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('appUpdate:downloadProgress', progress)
          }
        })
        return { filePath }
      },
    )
    ipcMain.handle('appUpdate:cancelDownload', async () => ({
      cancelled: cancelActiveDownload(),
    }))
    ipcMain.handle('appUpdate:install', async (_event, filePath: string) => {
      await installAppUpdate(filePath)
      return { accepted: true }
    })
    ipcMain.handle('channels:getConfig', async (_event, platform: Parameters<RuntimeManager['getChannelConfig']>[0]) =>
      this.runtimeManager.getChannelConfig(platform),
    )
    ipcMain.handle(
      'channels:supportsQrLogin',
      async (_event, platform: Parameters<RuntimeManager['supportsChannelQrLogin']>[0]) =>
        this.runtimeManager.supportsChannelQrLogin(platform),
    )
    ipcMain.handle(
      'channels:feishuInstallQrcode',
      async (_event, isLark: boolean) => this.runtimeManager.startFeishuInstallQrcode(isLark),
    )
    ipcMain.handle(
      'channels:feishuInstallPoll',
      async (_event, deviceCode: string) => this.runtimeManager.pollFeishuInstall(deviceCode),
    )
    ipcMain.handle(
      'channels:feishuVerifyCredentials',
      async (_event, appId: string, appSecret: string) => this.runtimeManager.verifyFeishuCredentials(appId, appSecret),
    )
    ipcMain.handle(
      'channels:saveConfig',
      async (
        _event,
        platform: Parameters<RuntimeManager['saveChannelConfig']>[0],
        config: Parameters<RuntimeManager['saveChannelConfig']>[1],
      ) => this.runtimeManager.saveChannelConfig(platform, config),
    )
    ipcMain.handle(
      'channels:listPairingRequests',
      async (_event, platform: Parameters<RuntimeManager['listPairingRequests']>[0]) =>
        this.runtimeManager.listPairingRequests(platform),
    )
    ipcMain.handle(
      'channels:approvePairingCode',
      async (_event, platform: Parameters<RuntimeManager['approvePairingCode']>[0], code: string) => ({
        approved: await this.runtimeManager.approvePairingCode(platform, code),
      }),
    )
    ipcMain.handle(
      'channels:rejectPairingRequest',
      async (_event, platform: Parameters<RuntimeManager['rejectPairingRequest']>[0], code: string) => ({
        rejected: this.runtimeManager.rejectPairingRequest(platform, code),
      }),
    )
  }
}
