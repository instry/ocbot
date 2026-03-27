import { app, utilityProcess, type UtilityProcess } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

/**
 * Manages the OpenClaw Gateway lifecycle.
 *
 * Borrows proven patterns from LobsterAI's OpenClawEngineManager:
 * - utilityProcess.fork() on macOS/Linux, spawn+ELECTRON_RUN_AS_NODE on Windows
 * - File-based token management
 * - Port scanning for availability
 * - Auto-generated openclaw.json with gateway.mode=local
 */

type GatewayProcess = UtilityProcess | ChildProcess

type RuntimeInfo = {
  root: string | null
  version: string | null
}

export type EngineStatus = 'not_installed' | 'ready' | 'starting' | 'running' | 'error'

const DEFAULT_PORT = 18789
const PORT_SCAN_LIMIT = 80
const BOOT_TIMEOUT_MS = 120_000
const HEALTH_INTERVAL_MS = 30_000

export class RuntimeManager {
  private readonly baseDir: string
  private readonly stateDir: string
  private readonly logsDir: string
  private readonly configPath: string
  private readonly tokenPath: string
  private readonly portPath: string

  private gateway: GatewayProcess | null = null
  private port: number | null = null
  private _status: EngineStatus = 'not_installed'
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private shutdownRequested = false

  constructor() {
    const userDataPath = app.getPath('userData')
    const subdir = app.isPackaged ? 'openclaw' : 'openclaw-dev'
    this.baseDir = path.join(userDataPath, subdir)
    this.stateDir = path.join(this.baseDir, 'state')
    this.logsDir = path.join(this.baseDir, 'logs')
    this.configPath = path.join(this.stateDir, 'openclaw.json')
    this.tokenPath = path.join(this.stateDir, 'gateway-token')
    this.portPath = path.join(this.stateDir, 'gateway-port.json')

    fs.mkdirSync(this.stateDir, { recursive: true })
    fs.mkdirSync(this.logsDir, { recursive: true })

    const runtime = this.resolveRuntime()
    this._status = runtime.root ? 'ready' : 'not_installed'
  }

  get status(): EngineStatus { return this._status }
  get gatewayPort(): number | null { return this.port }
  get gatewayToken(): string | null { return this.readToken() }

  /**
   * Start the gateway. Returns the port it's running on.
   */
  async start(): Promise<number> {
    this.shutdownRequested = false
    const runtime = this.resolveRuntime()
    if (!runtime.root) {
      this._status = 'not_installed'
      throw new Error('OpenClaw runtime not found')
    }

    // If already running and healthy, return early
    if (this.gateway && this.port) {
      if (await this.isHealthy(this.port)) {
        this._status = 'running'
        return this.port
      }
      this.killGateway()
    }

    this._status = 'starting'
    const token = this.ensureToken()
    const port = await this.resolvePort()
    this.port = port
    this.writePort(port)
    this.ensureConfig()

    const entry = this.resolveEntry(runtime.root)
    if (!entry) {
      this._status = 'error'
      throw new Error(`OpenClaw entry file not found in ${runtime.root}`)
    }

    console.log(`[RuntimeManager] Starting gateway: entry=${entry}, port=${port}`)

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OPENCLAW_HOME: runtime.root,
      OPENCLAW_STATE_DIR: this.stateDir,
      OPENCLAW_CONFIG_PATH: this.configPath,
      OPENCLAW_GATEWAY_TOKEN: token,
      OPENCLAW_GATEWAY_PORT: String(port),
      OPENCLAW_NO_RESPAWN: '1',
      OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(runtime.root, 'extensions'),
    }

    // Inject host timezone (macOS doesn't set TZ by default)
    if (!env.TZ) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (tz) env.TZ = tz
    }

    const args = ['gateway', '--bind', 'loopback', '--port', String(port), '--token', token, '--verbose']

    // Windows: spawn with ELECTRON_RUN_AS_NODE (utilityProcess is slow on Windows)
    // macOS/Linux: utilityProcess.fork for better integration
    if (process.platform === 'win32') {
      this.gateway = spawn(process.execPath, [entry, ...args], {
        cwd: runtime.root,
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } else {
      this.gateway = utilityProcess.fork(entry, args, {
        cwd: runtime.root,
        env,
        stdio: 'pipe',
        serviceName: 'OpenClaw Gateway',
      })
    }

    this.attachLogs(this.gateway)
    this.attachExitHandler(this.gateway)

    // Wait for healthy
    const ready = await this.waitForHealthy(port, BOOT_TIMEOUT_MS)
    if (!ready) {
      this._status = 'error'
      this.killGateway()
      throw new Error('Gateway did not become healthy in time')
    }

    this._status = 'running'
    this.startHealthCheck(port)
    console.log(`[RuntimeManager] Gateway running on port ${port}`)
    return port
  }

  /**
   * Stop the gateway.
   */
  stop(): void {
    this.shutdownRequested = true
    this.stopHealthCheck()
    this.killGateway()
    this._status = 'ready'
  }

  // --- Runtime resolution ---

  private resolveRuntime(): RuntimeInfo {
    const candidates = app.isPackaged
      ? [path.join(process.resourcesPath, 'openclaw')]
      : [
          // Dev: built runtime in vendor/
          path.join(app.getAppPath(), 'vendor', 'openclaw-runtime', 'current'),
          // Dev: direct sibling openclaw repo
          path.resolve(app.getAppPath(), '..', '..', 'openclaw'),
        ]

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        const version = this.readVersion(candidate)
        return { root: candidate, version }
      }
    }
    return { root: null, version: null }
  }

  private readVersion(root: string): string | null {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      return pkg.version || null
    } catch { return null }
  }

  private resolveEntry(root: string): string | null {
    // Prefer bundled gateway entry, then openclaw.mjs
    const candidates = [
      path.join(root, 'gateway-bundle.mjs'),
      path.join(root, 'openclaw.mjs'),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) return c
    }
    return null
  }

  // --- Config & Token ---

  private ensureConfig(): void {
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify({ gateway: { mode: 'local' } }, null, 2) + '\n')
      return
    }
    // Ensure gateway.mode=local even if config already exists
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
      if (!config.gateway?.mode) {
        config.gateway = { ...config.gateway, mode: 'local' }
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2) + '\n')
      }
    } catch { /* ignore parse errors */ }
  }

  private ensureToken(): string {
    const existing = this.readToken()
    if (existing) return existing
    const token = crypto.randomBytes(24).toString('hex')
    fs.writeFileSync(this.tokenPath, token, 'utf8')
    return token
  }

  private readToken(): string | null {
    try {
      const t = fs.readFileSync(this.tokenPath, 'utf8').trim()
      return t || null
    } catch { return null }
  }

  // --- Port ---

  private async resolvePort(): Promise<number> {
    const candidates = new Set<number>()
    candidates.add(DEFAULT_PORT)
    if (this.port) candidates.add(this.port)
    const persisted = this.readPort()
    if (persisted) candidates.add(persisted)

    for (const p of candidates) {
      if (await isPortAvailable(p)) return p
    }

    // Scan from DEFAULT_PORT+1
    for (let i = 1; i <= PORT_SCAN_LIMIT; i++) {
      if (await isPortAvailable(DEFAULT_PORT + i)) return DEFAULT_PORT + i
    }
    throw new Error('No available port for OpenClaw gateway')
  }

  private writePort(port: number): void {
    fs.writeFileSync(this.portPath, JSON.stringify({ port }))
  }

  private readPort(): number | null {
    try {
      const data = JSON.parse(fs.readFileSync(this.portPath, 'utf8'))
      return typeof data.port === 'number' ? data.port : null
    } catch { return null }
  }

  // --- Process management ---

  private attachLogs(child: GatewayProcess): void {
    const logStream = fs.createWriteStream(path.join(this.logsDir, 'gateway.log'), { flags: 'a' })

    const handle = (data: Buffer) => {
      const text = data.toString()
      process.stdout.write(`[gateway] ${text}`)
      logStream.write(text)
    }

    if ('stdout' in child && child.stdout) {
      child.stdout.on('data', handle)
    }
    if ('stderr' in child && child.stderr) {
      child.stderr.on('data', handle)
    }
  }

  private attachExitHandler(child: GatewayProcess): void {
    const onExit = (code: number | null) => {
      console.log(`[RuntimeManager] Gateway exited (code ${code})`)
      this.gateway = null
      if (!this.shutdownRequested) {
        console.log('[RuntimeManager] Restarting gateway in 3s...')
        this._status = 'error'
        setTimeout(() => {
          if (!this.shutdownRequested) {
            this.start().catch((err) => console.error('[RuntimeManager] Restart failed:', err))
          }
        }, 3000)
      }
    }

    if ('once' in child && typeof child.once === 'function') {
      (child as ChildProcess).on('exit', onExit)
    }
  }

  private killGateway(): void {
    if (!this.gateway) return
    try {
      if ('kill' in this.gateway) {
        this.gateway.kill()
      }
    } catch { /* already dead */ }
    this.gateway = null
  }

  // --- Health check ---

  private async isHealthy(port: number): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch { return false }
  }

  private async waitForHealthy(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.isHealthy(port)) return true
      await sleep(800)
    }
    return false
  }

  private startHealthCheck(port: number): void {
    this.healthTimer = setInterval(async () => {
      if (this.shutdownRequested) return
      if (!(await this.isHealthy(port))) {
        console.warn('[RuntimeManager] Gateway health check failed')
      }
    }, HEALTH_INTERVAL_MS)
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }
}

// --- Helpers ---

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => { server.close(() => resolve(true)) })
    server.listen(port, '127.0.0.1')
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
