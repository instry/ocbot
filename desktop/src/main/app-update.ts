import { app, session } from 'electron'
import { exec, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface AppUpdateAsset {
  url: string
  sha512?: string
  size?: number
  fileName?: string
}

export interface AppUpdateInfo {
  currentVersion: string
  latestVersion: string
  publishedAt: string
  notes: string[]
  releaseUrl?: string
  manifestUrl: string
  download: AppUpdateAsset
}

export interface AppUpdateDownloadProgress {
  received: number
  total: number | undefined
  percent: number | undefined
  speed: number | undefined
}

interface UpdateManifestPlatformAssets {
  universal?: AppUpdateAsset
  x64?: AppUpdateAsset
  arm64?: AppUpdateAsset
  ia32?: AppUpdateAsset
}

interface UpdateManifest {
  version?: string
  publishedAt?: string
  date?: string
  notes?: string[] | string
  releaseUrl?: string
  assets?: {
    darwin?: UpdateManifestPlatformAssets
    win32?: UpdateManifestPlatformAssets
    linux?: UpdateManifestPlatformAssets
  }
}

const DEFAULT_UPDATE_MANIFEST_URL = 'https://cdn.oc.bot/releases/latest.json'
const PROGRESS_THROTTLE_MS = 200
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000

let activeDownloadController: AbortController | null = null

function getUpdateManifestUrl(): string {
  const candidate = process.env.OCBOT_UPDATE_MANIFEST_URL?.trim()
  return candidate || DEFAULT_UPDATE_MANIFEST_URL
}

function toVersionParts(version: string): number[] {
  return version
    .split('.')
    .map((part) => {
      const match = part.trim().match(/^\d+/)
      return match ? Number.parseInt(match[0], 10) : 0
    })
}

function compareVersions(left: string, right: string): number {
  const leftParts = toVersionParts(left)
  const rightParts = toVersionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  return 0
}

function normalizeNotes(notes: UpdateManifest['notes']): string[] {
  if (Array.isArray(notes)) {
    return notes.map((entry) => String(entry).trim()).filter(Boolean)
  }
  if (typeof notes === 'string') {
    return notes
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

function resolvePlatformAsset(assets: UpdateManifest['assets']): AppUpdateAsset | null {
  const platformAssets = assets?.[process.platform as keyof NonNullable<UpdateManifest['assets']>]
  if (!platformAssets) {
    return null
  }

  if (process.platform === 'darwin' && platformAssets.universal?.url) {
    return platformAssets.universal
  }

  const direct = platformAssets[process.arch as keyof UpdateManifestPlatformAssets]
  if (direct?.url) {
    return direct
  }

  if (process.platform === 'win32' && platformAssets.x64?.url) {
    return platformAssets.x64
  }

  return null
}

function assertHttpsUrl(url: string): URL {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error(`Update URL must use https: ${url}`)
  }
  return parsed
}

async function sha512File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('base64')))
  })
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function execAsync(command: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\nstderr: ${stderr}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}

export async function checkForAppUpdate(currentVersion = app.getVersion()): Promise<AppUpdateInfo | null> {
  const manifestUrl = getUpdateManifestUrl()
  assertHttpsUrl(manifestUrl)

  const response = await session.defaultSession.fetch(manifestUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to load update manifest (${response.status})`)
  }

  const manifest = await response.json() as UpdateManifest
  const latestVersion = manifest.version?.trim()
  if (!latestVersion) {
    throw new Error('Update manifest is missing version')
  }

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return null
  }

  const download = resolvePlatformAsset(manifest.assets)
  if (!download?.url) {
    return null
  }

  assertHttpsUrl(download.url)

  return {
    currentVersion,
    latestVersion,
    publishedAt: manifest.publishedAt?.trim() || manifest.date?.trim() || '',
    notes: normalizeNotes(manifest.notes),
    releaseUrl: manifest.releaseUrl?.trim() || undefined,
    manifestUrl,
    download,
  }
}

export function cancelActiveDownload(): boolean {
  if (!activeDownloadController) {
    return false
  }
  activeDownloadController.abort('cancelled')
  activeDownloadController = null
  return true
}

export async function downloadAppUpdate(
  asset: AppUpdateAsset,
  version: string,
  onProgress: (progress: AppUpdateDownloadProgress) => void,
): Promise<string> {
  if (activeDownloadController) {
    throw new Error('A download is already in progress')
  }

  const parsedUrl = assertHttpsUrl(asset.url)
  const fileExtension = path.extname(parsedUrl.pathname) || (process.platform === 'darwin' ? '.dmg' : '.exe')
  const tempDir = app.getPath('temp')
  const timestamp = Date.now()
  const tempFilePath = path.join(tempDir, `ocbot-update-${version}-${timestamp}${fileExtension}.download`)
  const finalFilePath = path.join(tempDir, `ocbot-update-${version}-${timestamp}${fileExtension}`)
  const controller = new AbortController()
  activeDownloadController = controller

  let writeStream: fs.WriteStream | null = null
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null

  const clearInactivityTimer = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer)
      inactivityTimer = null
    }
  }

  const resetInactivityTimer = () => {
    clearInactivityTimer()
    inactivityTimer = setTimeout(() => {
      controller.abort('timeout')
    }, DOWNLOAD_INACTIVITY_TIMEOUT_MS)
  }

  try {
    const response = await session.defaultSession.fetch(asset.url, {
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Download failed (HTTP ${response.status})`)
    }

    if (!response.body) {
      throw new Error('Download response body is empty')
    }

    const totalHeader = response.headers.get('content-length')
    const total = totalHeader ? Number(totalHeader) : asset.size
    let received = 0
    let lastSpeedTime = Date.now()
    let lastSpeedBytes = 0
    let currentSpeed: number | undefined
    let lastProgressTime = 0

    const emitProgress = () => {
      onProgress({
        received,
        total: total && Number.isFinite(total) ? total : undefined,
        percent: total && Number.isFinite(total) && total > 0 ? received / total : undefined,
        speed: currentSpeed,
      })
    }

    emitProgress()

    await fs.promises.mkdir(path.dirname(tempFilePath), { recursive: true })
    writeStream = fs.createWriteStream(tempFilePath)

    const nodeStream = Readable.fromWeb(response.body as any)
    resetInactivityTimer()

    nodeStream.on('data', (chunk: Buffer) => {
      received += chunk.length
      resetInactivityTimer()

      const now = Date.now()
      const elapsed = now - lastSpeedTime
      if (elapsed >= 1000) {
        currentSpeed = ((received - lastSpeedBytes) / elapsed) * 1000
        lastSpeedTime = now
        lastSpeedBytes = received
      }

      if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
        lastProgressTime = now
        emitProgress()
      }
    })

    await pipeline(nodeStream, writeStream)
    writeStream = null
    clearInactivityTimer()

    const stat = await fs.promises.stat(tempFilePath)
    if (stat.size === 0) {
      throw new Error('Downloaded update file is empty')
    }
    if (total && Number.isFinite(total) && stat.size !== total) {
      throw new Error(`Downloaded update file is incomplete (${stat.size}/${total})`)
    }
    if (asset.sha512) {
      const actualSha512 = await sha512File(tempFilePath)
      if (actualSha512 !== asset.sha512) {
        throw new Error('Downloaded update file failed integrity verification')
      }
    }

    await fs.promises.rename(tempFilePath, finalFilePath)
    onProgress({
      received,
      total: total && Number.isFinite(total) ? total : received,
      percent: 1,
      speed: currentSpeed,
    })

    return finalFilePath
  } catch (error) {
    clearInactivityTimer()
    if (writeStream) {
      writeStream.destroy()
    }
    await fs.promises.unlink(tempFilePath).catch(() => {})

    if (controller.signal.aborted) {
      if (controller.signal.reason === 'timeout') {
        throw new Error('Download timed out')
      }
      throw new Error('Download cancelled')
    }

    throw error
  } finally {
    activeDownloadController = null
  }
}

export async function installAppUpdate(filePath: string): Promise<void> {
  const stat = await fs.promises.stat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      throw new Error('Update file not found')
    }
    throw error
  })

  if (!stat || stat.size === 0) {
    throw new Error('Update file is empty')
  }

  if (process.platform === 'darwin') {
    await installMacDmg(filePath)
    return
  }

  if (process.platform === 'win32') {
    await installWindowsNsis(filePath)
    return
  }

  throw new Error('Unsupported platform')
}

async function installMacDmg(dmgPath: string): Promise<void> {
  let mountPoint: string | null = null

  try {
    const mountOutput = await execAsync(
      `hdiutil attach ${shellEscape(dmgPath)} -nobrowse -noautoopen -noverify`,
      60_000,
    )

    const lines = mountOutput.split('\n').filter((line) => line.trim())
    const lastLine = lines[lines.length - 1]
    const mountMatch = lastLine?.match(/\t(\/Volumes\/.+)$/)
    if (!mountMatch) {
      throw new Error('Failed to determine mount point')
    }

    mountPoint = mountMatch[1]
    const entries = await fs.promises.readdir(mountPoint)
    const appBundle = entries.find((entry) => entry.endsWith('.app'))
    if (!appBundle) {
      throw new Error('No app bundle found in update image')
    }

    const sourceApp = path.join(mountPoint, appBundle)
    const currentAppPath = path.resolve(process.resourcesPath, '..', '..', '..')
    const targetApp = currentAppPath.endsWith('.app') ? currentAppPath : `/Applications/${appBundle}`

    try {
      await execAsync(
        `rm -rf ${shellEscape(targetApp)} && cp -R ${shellEscape(sourceApp)} ${shellEscape(targetApp)}`,
        300_000,
      )
    } catch {
      const escapeForInnerShell = (value: string) =>
        value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
      const escapedTarget = escapeForInnerShell(targetApp)
      const escapedSource = escapeForInnerShell(sourceApp)
      await execAsync(
        `osascript -e 'do shell script "rm -rf \\"${escapedTarget}\\" && cp -R \\"${escapedSource}\\" \\"${escapedTarget}\\"" with administrator privileges'`,
        300_000,
      )
    }

    await execAsync(`hdiutil detach ${shellEscape(mountPoint)} -force`, 30_000).catch(() => '')
    mountPoint = null
    await fs.promises.unlink(dmgPath).catch(() => {})

    const executableDir = path.join(targetApp, 'Contents', 'MacOS')
    const executables = await fs.promises.readdir(executableDir)
    const executable = executables[0]

    if (executable) {
      app.relaunch({ execPath: path.join(executableDir, executable) })
    } else {
      app.relaunch()
    }
    app.quit()
  } catch (error) {
    if (mountPoint) {
      await execAsync(`hdiutil detach ${shellEscape(mountPoint)} -force`, 30_000).catch(() => '')
    }
    throw error
  }
}

async function installWindowsNsis(exePath: string): Promise<void> {
  const timestamp = Date.now()
  const tempDir = app.getPath('temp')
  const logPath = path.join(tempDir, `ocbot-update-${timestamp}.log`)
  const scriptPath = path.join(tempDir, `ocbot-update-${timestamp}.ps1`)
  const vbsPath = path.join(tempDir, `ocbot-update-${timestamp}.vbs`)
  const psEscape = (value: string) => value.replace(/'/g, "''")

  const psScript = [
    `$logPath = '${psEscape(logPath)}'`,
    `$appPid = ${process.pid}`,
    `$installerPath = '${psEscape(exePath)}'`,
    '',
    'function Log($msg) {',
    "    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'",
    '    Add-Content -Path $logPath -Value "[$ts] $msg" -Encoding UTF8',
    '}',
    '',
    'try {',
    '    Log "Update script started (appPid=$appPid)"',
    '    $waited = 0',
    '    while ($waited -lt 120) {',
    '        try {',
    '            Get-Process -Id $appPid -ErrorAction Stop | Out-Null',
    '            Start-Sleep -Seconds 1',
    '            $waited++',
    '        } catch {',
    '            break',
    '        }',
    '    }',
    '    Log "App exited after $waited seconds"',
    '    Start-Process -FilePath $installerPath',
    '    Log "Installer launched"',
    '} catch {',
    '    Log "ERROR: $($_.Exception.Message)"',
    '}',
  ].join('\r\n')

  await fs.promises.writeFile(scriptPath, `\ufeff${psScript}`, 'utf8')
  await fs.promises.writeFile(
    vbsPath,
    `CreateObject("WScript.Shell").Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${scriptPath}""", 0, False`,
    'utf8',
  )

  const launcher = spawn('wscript.exe', [vbsPath], {
    detached: true,
    stdio: 'ignore',
  })
  launcher.unref()
  app.quit()
}
