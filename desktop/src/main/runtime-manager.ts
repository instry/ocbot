import { ChildProcess, spawn } from 'node:child_process'
import { existsSync, readFileSync, renameSync, symlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * Manages the OpenClaw Gateway child process lifecycle.
 *
 * Responsibilities:
 * - Locate Node.js binary and OpenClaw runtime (OTA or bundled)
 * - Apply pending OTA updates on startup
 * - Spawn gateway subprocess with correct env vars
 * - Health check and auto-restart on failure
 * - Graceful shutdown
 */
export class RuntimeManager {
  private process: ChildProcess | null = null
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private stopping = false
  private consecutiveFailures = 0

  private readonly port: number
  private readonly resourcesDir: string
  private readonly appDataDir: string

  constructor(port: number) {
    this.port = port
    this.resourcesDir = this.resolveResourcesDir()
    this.appDataDir = this.resolveAppDataDir()
  }

  /**
   * Start the gateway: apply pending updates, then spawn.
   */
  async start(): Promise<void> {
    this.stopping = false
    this.applyPendingUpdate()
    this.spawnGateway()
    await this.waitForHealthy(30_000)
    this.startHealthCheck()
  }

  /**
   * Stop the gateway gracefully.
   */
  stop(): void {
    this.stopping = true
    this.stopHealthCheck()
    if (this.process) {
      this.process.kill('SIGTERM')
      // Force kill after 5s
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL')
        }
      }, 5_000)
      this.process = null
    }
  }

  // --- Process management ---

  private spawnGateway(): void {
    const { nodePath, openclawPath, nodeModulesPath } = this.resolveRuntime()

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      OPENCLAW_CONFIG_PATH: join(this.configDir, 'openclaw.json'),
      OPENCLAW_STATE_DIR: this.configDir,
      OPENCLAW_BUNDLED_PLUGINS_DIR: join(this.openclawDir, 'extensions'),
      OPENCLAW_NO_RESPAWN: '1',
    }

    if (nodeModulesPath) {
      env.NODE_PATH = nodeModulesPath
    }

    console.log(`[RuntimeManager] Starting gateway: ${nodePath} ${openclawPath}`)

    this.process = spawn(nodePath, [
      openclawPath, 'gateway', 'run',
      '--port', String(this.port),
      '--bind', 'loopback',
      '--force',
    ], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(`[gateway] ${data}`)
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[gateway] ${data}`)
    })

    this.process.on('exit', (code) => {
      console.log(`[RuntimeManager] Gateway exited with code ${code}`)
      this.process = null
      if (!this.stopping) {
        console.log('[RuntimeManager] Restarting gateway...')
        setTimeout(() => this.spawnGateway(), 2_000)
      }
    })
  }

  // --- Health check ---

  private startHealthCheck(): void {
    this.healthTimer = setInterval(() => this.checkHealth(), 30_000)
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }

  private async checkHealth(): Promise<void> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/health`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (res.ok) {
        this.consecutiveFailures = 0
        return
      }
    } catch { /* connection failed */ }

    this.consecutiveFailures++
    if (this.consecutiveFailures >= 3 && !this.stopping) {
      console.warn('[RuntimeManager] Gateway unresponsive, restarting...')
      this.consecutiveFailures = 0
      if (this.process) {
        this.process.kill('SIGKILL')
        this.process = null
      }
      this.spawnGateway()
    }
  }

  private async waitForHealthy(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`, {
          signal: AbortSignal.timeout(2_000),
        })
        if (res.ok) return
      } catch { /* not ready yet */ }
      await new Promise(r => setTimeout(r, 500))
    }
    throw new Error(`Gateway did not become healthy within ${timeoutMs}ms`)
  }

  // --- Runtime resolution ---

  /**
   * Resolve Node.js binary + OpenClaw entry point.
   * Priority: OTA runtime > bundled runtime.
   */
  private resolveRuntime(): {
    nodePath: string
    openclawPath: string
    nodeModulesPath: string | null
  } {
    // Node binary: always from bundled resources
    const nodePath = this.resolveNodeBinary()

    // OpenClaw: check OTA first, then bundled
    const otaAppCurrent = join(this.runtimeDir, 'app', 'current', 'openclaw.mjs')
    if (existsSync(otaAppCurrent)) {
      const otaBase = join(this.runtimeDir, 'base', 'current', 'node_modules')
      return {
        nodePath,
        openclawPath: otaAppCurrent,
        nodeModulesPath: existsSync(otaBase) ? otaBase : null,
      }
    }

    // Bundled fallback
    const bundled = join(this.openclawDir, 'openclaw.mjs')
    return { nodePath, openclawPath: bundled, nodeModulesPath: null }
  }

  private resolveNodeBinary(): string {
    const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'

    // Dev mode: use system node
    if (!app.isPackaged) {
      return 'node'
    }

    const bundled = join(this.resourcesDir, 'node', nodeName)
    if (existsSync(bundled)) return bundled

    // Fallback to system node
    return 'node'
  }

  // --- OTA update application ---

  private applyPendingUpdate(): void {
    const pendingPath = join(this.runtimeDir, 'pending-update.json')
    if (!existsSync(pendingPath)) return

    try {
      const pending = JSON.parse(readFileSync(pendingPath, 'utf-8'))
      const { appVersion, baseVersion } = pending

      if (appVersion) {
        const versionsDir = join(this.runtimeDir, 'app', 'versions')
        const target = join(versionsDir, appVersion)
        if (existsSync(target)) {
          this.atomicSymlinkSwap(join(this.runtimeDir, 'app', 'current'), target)
          console.log(`[RuntimeManager] Applied app update: ${appVersion}`)
        }
      }

      if (baseVersion) {
        const versionsDir = join(this.runtimeDir, 'base', 'versions')
        const target = join(versionsDir, baseVersion)
        if (existsSync(target)) {
          this.atomicSymlinkSwap(join(this.runtimeDir, 'base', 'current'), target)
          console.log(`[RuntimeManager] Applied base update: ${baseVersion}`)
        }
      }

      unlinkSync(pendingPath)
    } catch (err) {
      console.error('[RuntimeManager] Failed to apply pending update:', err)
    }
  }

  private atomicSymlinkSwap(linkPath: string, target: string): void {
    const tmp = linkPath + '.tmp'
    try { unlinkSync(tmp) } catch { /* ignore */ }
    symlinkSync(target, tmp)
    renameSync(tmp, linkPath)
  }

  // --- Path helpers ---

  private get configDir(): string {
    const subdir = app.isPackaged ? 'openclaw-config' : 'openclaw-dev-config'
    return join(this.appDataDir, subdir)
  }

  private get runtimeDir(): string {
    return join(this.appDataDir, 'runtime')
  }

  private get openclawDir(): string {
    if (!app.isPackaged) {
      // Dev mode: use sibling openclaw directory
      const devPath = join(process.cwd(), '..', '..', 'openclaw')
      if (existsSync(join(devPath, 'openclaw.mjs'))) return devPath
    }
    return join(this.resourcesDir, 'openclaw')
  }

  private resolveResourcesDir(): string {
    if (app.isPackaged) {
      return process.resourcesPath
    }
    return join(app.getAppPath(), 'resources')
  }

  private resolveAppDataDir(): string {
    const name = 'Ocbot'
    switch (process.platform) {
      case 'darwin':
        return join(app.getPath('appData'), name)
      case 'win32':
        return join(app.getPath('appData'), name)
      default:
        return join(app.getPath('home'), '.config', name.toLowerCase())
    }
  }
}
