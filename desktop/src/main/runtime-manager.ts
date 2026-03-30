import { app, utilityProcess, type UtilityProcess } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { CHANNEL_CONFIG_MAP, DEFAULT_CHANNEL_CONFIG } from './channels/registry'
import { WeixinRuntime } from './channels/weixin-runtime'
import type {
  DesktopChannelConfig,
  DesktopChannelPlatform,
  DesktopChannelPolicy,
  DesktopPairingRequest,
} from './channels/types'

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

type FeishuAuthModule = {
  FeishuAuth: new (...args: unknown[]) => {
    setDomain: (isLark: boolean) => void
    init: () => Promise<void>
    begin: () => Promise<{
      verification_uri_complete: string
      device_code: string
      interval?: number
      expire_in?: number
    }>
    poll: (deviceCode: string) => Promise<{
      error?: string
      error_description?: string
      client_id?: string
      client_secret?: string
      user_info?: {
        tenant_brand?: string
      }
    }>
  }
  validateAppCredentials: (appId: string, appSecret: string) => Promise<boolean>
}

type RuntimeInfo = {
  root: string | null
  version: string | null
}

type RuntimeStateMarker = {
  appVersion: string
  runtimeVersion: string | null
  runtimePreparedAt: string | null
  runtimeCommit: string | null
}

export type EngineStatus = 'not_installed' | 'ready' | 'starting' | 'running' | 'error'

const DEFAULT_PORT = 18789
const PORT_SCAN_LIMIT = 80
const BOOT_TIMEOUT_MS = 120_000
const HEALTH_INTERVAL_MS = 30_000
const RESET_HELPER_SCRIPT = `
const fs = require('node:fs')
const { spawn } = require('node:child_process')

const plan = JSON.parse(Buffer.from(process.argv[1], 'base64').toString('utf8'))

function waitForParentExit() {
  try {
    process.kill(plan.pid, 0)
    setTimeout(waitForParentExit, 250)
    return
  } catch {}

  for (const target of plan.targets) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
    } catch {}
  }

  if (plan.openApp === true) {
    spawn('open', ['-n', plan.launchTarget], {
      detached: true,
      stdio: 'ignore',
    }).unref()
    return
  }

  spawn(plan.launchTarget, plan.launchArgs, {
    detached: true,
    stdio: 'ignore',
  }).unref()
}

waitForParentExit()
`

function createInitialConfig(): Record<string, unknown> {
  return {
    browser: createManagedBrowserConfig(),
    gateway: {
      mode: 'local',
      bind: 'loopback',
      auth: {
        mode: 'none',
      },
      controlUi: {
        allowedOrigins: ['null'],
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
      },
    },
    ui: {
      assistant: {
        name: 'Ocbot',
      },
      seamColor: '#7c3aed',
    },
  }
}

function createManagedBrowserConfig(): Record<string, unknown> {
  return {
    profiles: {
      ocbot: {
        cdpUrl: 'http://127.0.0.1:9222',
        attachOnly: true,
        driver: 'openclaw',
        color: '#7c3aed',
      },
    },
    defaultProfile: 'ocbot',
  }
}

function shouldPromoteManagedBrowser(config: Record<string, unknown>): boolean {
  const executablePath = typeof config.executablePath === 'string' ? config.executablePath.trim() : ''
  if (executablePath) return false

  const defaultProfile = typeof config.defaultProfile === 'string' ? config.defaultProfile.trim() : ''
  if (defaultProfile !== 'user') return false

  const profiles = asRecord(config.profiles)
  const userProfile = asRecord(profiles.user)
  const userDriver = typeof userProfile.driver === 'string' ? userProfile.driver.trim() : ''
  const userDataDir = typeof userProfile.userDataDir === 'string' ? userProfile.userDataDir.trim() : ''

  return userDriver === 'existing-session' || userDataDir !== ''
}

const PAIRING_PENDING_TTL_MS = 3_600_000

export class RuntimeManager {
  private readonly stateDir: string
  private readonly logsDir: string
  private readonly configPath: string
  private readonly tokenPath: string
  private readonly portPath: string
  private readonly runtimeStateMarkerPath: string

  private gateway: GatewayProcess | null = null
  private port: number | null = null
  private _status: EngineStatus = 'not_installed'
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private shutdownRequested = false
  private feishuInstallIsLark = false
  private feishuAuthModulePromise: Promise<FeishuAuthModule> | null = null
  private readonly weixinRuntime: WeixinRuntime
  private readonly intentionallyStoppedGateways = new WeakSet<object>()

  constructor() {
    const userDataPath = app.getPath('userData')
    const runtimeRoot = app.isPackaged
      ? path.join(userDataPath, 'openclaw')
      : path.join(app.getAppPath(), '.ocbot-dev-runtime')

    this.stateDir = path.join(runtimeRoot, 'state')
    this.logsDir = path.join(this.stateDir, 'logs')

    this.configPath = path.join(this.stateDir, 'openclaw.json')
    this.tokenPath = path.join(this.stateDir, 'gateway-token')
    this.portPath = path.join(this.stateDir, 'gateway-port.json')
    this.runtimeStateMarkerPath = path.join(this.stateDir, '.runtime-state.json')
    this.weixinRuntime = new WeixinRuntime({
      ensurePluginEnabled: (pluginId) => this.ensurePluginEnabled(pluginId),
      resolvePluginSourceFile: (root, pluginId, pathParts) => this.resolvePluginSourceFile(root, pluginId, pathParts),
    })

    const runtime = this.resolveRuntime()
    this.ensureFreshPackagedState(runtime)
    fs.mkdirSync(this.stateDir, { recursive: true })
    fs.mkdirSync(this.logsDir, { recursive: true })
    if (runtime.root) {
      this.applyRuntimePatches(runtime.root)
    }
    this._status = runtime.root ? 'ready' : 'not_installed'
  }

  get status(): EngineStatus { return this._status }
  get gatewayPort(): number | null { return this.port }
  get gatewayToken(): string | null { return this.readToken() }
  getStateDir(): string { return this.stateDir }

  scheduleResetLocalData(): void {
    try {
      const userDataPath = app.getPath('userData')
      const resetTargets = [userDataPath]
      const launchTarget = process.platform === 'darwin' && app.isPackaged
        ? path.resolve(process.execPath, '..', '..', '..')
        : process.execPath
      const launchArgs = process.platform === 'darwin' && app.isPackaged ? [] : process.argv.slice(1)
      if (!app.isPackaged) {
        resetTargets.push(path.join(app.getAppPath(), '.ocbot-dev-runtime'))
      }

      const plan = Buffer.from(JSON.stringify({
        pid: process.pid,
        targets: [...new Set(resetTargets)],
        launchTarget,
        launchArgs,
        openApp: process.platform === 'darwin' && app.isPackaged,
      }), 'utf8').toString('base64')

      this.stop()

      const helper = spawn(process.execPath, ['-e', RESET_HELPER_SCRIPT, plan], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
        },
      })
      helper.unref()
      app.exit(0)
    } catch (error) {
      console.error('[RuntimeManager] Failed to reset local data:', error)
      throw error
    }
  }

  async prepareGatewayConnection(): Promise<{ port: number; token: string }> {
    const token = this.ensureToken()
    const port = await this.resolvePort()
    this.port = port
    this.writePort(port)
    return { port, token }
  }

  getChannelConfig(platform: DesktopChannelPlatform): DesktopChannelConfig {
    this.ensureConfig()
    const mapping = CHANNEL_CONFIG_MAP[platform]
    const config = this.readConfigObject()
    const channels = asRecord(config.channels)
    const rawChannel = asRecord(channels[mapping.channelKey])
    const dmPolicy = this.readPolicy(rawChannel.dmPolicy, this.readNestedDmPolicy(rawChannel))
    const groupPolicy = this.readPolicy(rawChannel.groupPolicy, DEFAULT_CHANNEL_CONFIG.groupPolicy)

    const nextConfig: DesktopChannelConfig = {
      ...DEFAULT_CHANNEL_CONFIG,
      enabled: rawChannel.enabled !== false && Object.keys(rawChannel).length > 0,
      dmPolicy,
      groupPolicy,
    }

    for (const [uiKey, rawKey] of Object.entries(mapping.credentials)) {
      const value = this.readString(rawChannel[rawKey])
      if (value) {
        ;(nextConfig as Record<string, unknown>)[uiKey] = value
      }
    }

    if (platform === 'feishu') {
      const domain = this.readString(rawChannel.domain)
      if (domain) {
        nextConfig.domain = domain
      }
    }

    return nextConfig
  }

  async saveChannelConfig(platform: DesktopChannelPlatform, nextConfig: DesktopChannelConfig): Promise<DesktopChannelConfig> {
    this.ensureConfig()
    const mapping = CHANNEL_CONFIG_MAP[platform]
    const config = this.readConfigObject()
    const channels = { ...asRecord(config.channels) }
    const plugins = asRecord(config.plugins)
    const pluginEntries = { ...asRecord(plugins.entries) }
    const currentChannel = asRecord(channels[mapping.channelKey])
    const nextChannel: Record<string, unknown> = {
      ...currentChannel,
      enabled: nextConfig.enabled,
    }

    if (mapping.supportsDmPolicy !== false) {
      nextChannel.dmPolicy = nextConfig.dmPolicy
      if (this.hasNestedDmPolicy(currentChannel)) {
        nextChannel.dm = {
          ...asRecord(currentChannel.dm),
          policy: nextConfig.dmPolicy,
        }
      }
    }

    if (mapping.supportsGroupPolicy !== false) {
      nextChannel.groupPolicy = nextConfig.groupPolicy
    }

    for (const [uiKey, rawKey] of Object.entries(mapping.credentials)) {
      const rawValue = (nextConfig as Record<string, unknown>)[uiKey]
      const value = typeof rawValue === 'string' ? rawValue.trim() : ''
      if (value) {
        nextChannel[rawKey] = value
      } else {
        delete nextChannel[rawKey]
      }
    }

    if (platform === 'feishu') {
      const domain = typeof nextConfig.domain === 'string' ? nextConfig.domain.trim() : ''
      if (domain) {
        nextChannel.domain = domain
      } else {
        delete nextChannel.domain
      }
    }

    const previousSerialized = JSON.stringify(currentChannel)
    const nextSerialized = JSON.stringify(nextChannel)
    if (previousSerialized === nextSerialized) {
      return this.getChannelConfig(platform)
    }

    channels[mapping.channelKey] = nextChannel
    config.channels = channels

    if (mapping.pluginId && this.hasRuntimePlugin(this.resolveRuntime().root, mapping.pluginId)) {
      pluginEntries[mapping.pluginId] = {
        ...asRecord(pluginEntries[mapping.pluginId]),
        enabled: nextConfig.enabled !== false,
      }
      config.plugins = {
        ...plugins,
        entries: pluginEntries,
      }
    }

    this.writeConfigObject(config)

    return this.getChannelConfig(platform)
  }

  async supportsChannelQrLogin(platform: DesktopChannelPlatform): Promise<boolean> {
    if (platform === 'whatsapp') {
      return true
    }

    if (platform === 'feishu') {
      return true
    }

    if (platform !== 'weixin') {
      return false
    }

    const runtime = this.resolveRuntime()
    if (!runtime.root) {
      return false
    }

    try {
      return await this.weixinRuntime.isQrLoginSupported(runtime.root)
    } catch (error) {
      console.error('[RuntimeManager] Failed to determine Weixin QR support:', error)
      return false
    }
  }

  async startFeishuInstallQrcode(isLark: boolean): Promise<{
    url: string
    deviceCode: string
    interval: number
    expireIn: number
  }> {
    const { FeishuAuth } = await this.getFeishuAuthModule()
    this.feishuInstallIsLark = isLark
    const auth = new FeishuAuth()
    auth.setDomain(isLark)
    await auth.init()
    const response = await auth.begin()
    return {
      url: response.verification_uri_complete,
      deviceCode: response.device_code,
      interval: response.interval ?? 5,
      expireIn: response.expire_in ?? 300,
    }
  }

  async pollFeishuInstall(deviceCode: string): Promise<{
    done: boolean
    appId?: string
    appSecret?: string
    domain?: string
    error?: string
  }> {
    const { FeishuAuth } = await this.getFeishuAuthModule()
    const auth = new FeishuAuth()
    auth.setDomain(this.feishuInstallIsLark)
    const response = await auth.poll(deviceCode)

    if (response.error) {
      if (response.error === 'authorization_pending' || response.error === 'slow_down') {
        return { done: false }
      }
      return {
        done: false,
        error: response.error_description || response.error,
      }
    }

    if (response.client_id && response.client_secret) {
      return {
        done: true,
        appId: response.client_id,
        appSecret: response.client_secret,
        domain: response.user_info?.tenant_brand === 'lark' ? 'lark' : 'feishu',
      }
    }

    return { done: false }
  }

  async verifyFeishuCredentials(appId: string, appSecret: string): Promise<{
    success: boolean
    error?: string
  }> {
    const { validateAppCredentials } = await this.getFeishuAuthModule()
    try {
      const valid = await validateAppCredentials(appId, appSecret)
      return valid
        ? { success: true }
        : { success: false, error: 'Failed to verify Feishu credentials' }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  listPairingRequests(platform: DesktopChannelPlatform): {
    requests: DesktopPairingRequest[]
    allowFrom: string[]
  } {
    const channelKey = CHANNEL_CONFIG_MAP[platform].channelKey
    const requests = this.readPairingFile(channelKey).filter((request) => {
      const createdAt = new Date(request.createdAt).getTime()
      return !Number.isNaN(createdAt) && Date.now() - createdAt < PAIRING_PENDING_TTL_MS
    })

    return {
      requests,
      allowFrom: this.readAllowFromFile(channelKey),
    }
  }

  async approvePairingCode(platform: DesktopChannelPlatform, code: string): Promise<boolean> {
    const channelKey = CHANNEL_CONFIG_MAP[platform].channelKey
    const requests = this.readPairingFile(channelKey)
    const normalizedCode = code.trim().toUpperCase()
    const requestIndex = requests.findIndex(request => request.code === normalizedCode)

    if (requestIndex === -1) {
      return false
    }

    const [approved] = requests.splice(requestIndex, 1)
    this.writePairingFile(channelKey, requests)

    const accountId = this.readString(approved.meta?.accountId)
    const allowFrom = this.readAllowFromFile(channelKey, accountId)
    if (!allowFrom.includes(approved.id)) {
      allowFrom.push(approved.id)
      this.writeAllowFromFile(channelKey, allowFrom, accountId)
    }

    if (this.status === 'running') {
      await this.restart()
    }

    return true
  }

  rejectPairingRequest(platform: DesktopChannelPlatform, code: string): boolean {
    const channelKey = CHANNEL_CONFIG_MAP[platform].channelKey
    const requests = this.readPairingFile(channelKey)
    const normalizedCode = code.trim().toUpperCase()
    const requestIndex = requests.findIndex(request => request.code === normalizedCode)

    if (requestIndex === -1) {
      return false
    }

    requests.splice(requestIndex, 1)
    this.writePairingFile(channelKey, requests)
    return true
  }

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
    const pluginsChanged = await this.ensureDefaultPlugins(runtime.root)
    const patchesChanged = this.applyRuntimePatches(runtime.root)

    // If already running and healthy, return early
    if (this.gateway && this.port) {
      if (await this.isHealthy(this.port)) {
        if (!pluginsChanged && !patchesChanged) {
          this._status = 'running'
          return this.port
        }
      } else {
        this.killGateway()
      }
    }

    this._status = 'starting'
    const { token, port } = await this.prepareGatewayConnection()
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

    const nodeExecutable = this.resolveNodeExecutable()
    if (!app.isPackaged && nodeExecutable) {
      this.gateway = spawn(nodeExecutable, [entry, ...args], {
        cwd: runtime.root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } else if (process.platform === 'win32') {
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

    const startupError = await this.waitForGatewayStartup(this.gateway, port, BOOT_TIMEOUT_MS)
    if (startupError) {
      this._status = 'error'
      this.killGateway()
      throw new Error(startupError)
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

  async restart(): Promise<number> {
    this.stop()
    return await this.start()
  }

  // --- Runtime resolution ---

  private resolveRuntime(): RuntimeInfo {
    const runtimeRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'openclaw')
      : path.join(app.getAppPath(), 'resources', 'openclaw')

    if (fs.existsSync(runtimeRoot)) {
      const version = this.readVersion(runtimeRoot)
      return { root: runtimeRoot, version }
    }

    return { root: null, version: null }
  }

  private readVersion(root: string): string | null {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      return pkg.version || null
    } catch { return null }
  }

  private ensureFreshPackagedState(runtime: RuntimeInfo): void {
    if (!app.isPackaged || !runtime.root) {
      return
    }

    const currentMarker = this.buildRuntimeStateMarker(runtime)
    const previousMarker = this.readJsonFile<RuntimeStateMarker | null>(this.runtimeStateMarkerPath, null)
    if (this.isSameRuntimeStateMarker(previousMarker, currentMarker)) {
      return
    }

    if (fs.existsSync(this.stateDir)) {
      fs.rmSync(this.stateDir, { recursive: true, force: true })
      console.log(`[RuntimeManager] Reset packaged runtime state for app version ${currentMarker.appVersion}`)
    }

    fs.mkdirSync(this.stateDir, { recursive: true })
    this.atomicWriteJson(this.runtimeStateMarkerPath, currentMarker)
  }

  private buildRuntimeStateMarker(runtime: RuntimeInfo): RuntimeStateMarker {
    const bundledMarker = runtime.root
      ? this.readJsonFile<{
        preparedAt?: unknown
        openclawCommit?: unknown
      } | null>(path.join(runtime.root, '.ocbot-runtime-ready.json'), null)
      : null

    return {
      appVersion: app.getVersion(),
      runtimeVersion: runtime.version,
      runtimePreparedAt: typeof bundledMarker?.preparedAt === 'string' ? bundledMarker.preparedAt : null,
      runtimeCommit: typeof bundledMarker?.openclawCommit === 'string' ? bundledMarker.openclawCommit : null,
    }
  }

  private isSameRuntimeStateMarker(
    left: RuntimeStateMarker | null,
    right: RuntimeStateMarker,
  ): boolean {
    return left?.appVersion === right.appVersion
      && left?.runtimeVersion === right.runtimeVersion
      && left?.runtimePreparedAt === right.runtimePreparedAt
      && left?.runtimeCommit === right.runtimeCommit
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

  private resolveNodeExecutable(): string | null {
    if (app.isPackaged) {
      return null
    }

    const candidates = [
      process.env.npm_node_execpath,
      process.env.NODE,
      'node',
    ]

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate
      }
    }

    return null
  }

  private async getFeishuAuthModule(): Promise<FeishuAuthModule> {
    if (!this.feishuAuthModulePromise) {
      this.feishuAuthModulePromise = import('@larksuite/openclaw-lark-tools/dist/utils/feishu-auth.js') as unknown as Promise<FeishuAuthModule>
    }
    return await this.feishuAuthModulePromise
  }

  private applyRuntimePatches(root: string): boolean {
    const changed = [
      this.weixinRuntime.applyGatewayPatches(),
      this.patchChannelSetupErrorMessage(root),
    ]
    return changed.some(Boolean)
  }

  private async ensureDefaultPlugins(root: string): Promise<boolean> {
    const weixin = await this.weixinRuntime.ensurePluginReady(root)
    const enabledPlugins = [weixin.changed]

    if (this.shouldEnableBundledPlugin('feishu', 'feishu')) {
      enabledPlugins.push(this.ensurePluginEnabled('feishu'))
    }

    return enabledPlugins.some(Boolean)
  }

  private shouldEnableBundledPlugin(platform: DesktopChannelPlatform, pluginId: string): boolean {
    if (!this.hasRuntimePlugin(this.resolveRuntime().root, pluginId)) {
      return false
    }

    this.ensureConfig()
    const config = this.readConfigObject()
    const channelConfig = asRecord(asRecord(config.channels)[CHANNEL_CONFIG_MAP[platform].channelKey])
    return Object.keys(channelConfig).length > 0 && channelConfig.enabled !== false
  }

  private ensurePluginEnabled(pluginId: string): boolean {
    this.ensureConfig()
    const config = this.readConfigObject()
    const plugins = asRecord(config.plugins)
    const entries = { ...asRecord(plugins.entries) }
    const currentEntry = asRecord(entries[pluginId])
    if (currentEntry.enabled === true) {
      return false
    }

    entries[pluginId] = {
      ...currentEntry,
      enabled: true,
    }
    config.plugins = {
      ...plugins,
      entries,
    }
    this.writeConfigObject(config)
    return true
  }

  private resolvePluginSourceFile(root: string, pluginId: string, pathParts: string[]): string {
    const candidates = [
      path.join(root, 'extensions', pluginId, ...pathParts),
      path.join(this.stateDir, 'extensions', pluginId, ...pathParts),
    ]

    return candidates.find(candidate => fs.existsSync(candidate)) ?? candidates[0]
  }

  private patchChannelSetupErrorMessage(root: string): boolean {
    const filePath = path.join(root, 'src', 'auto-reply', 'reply', 'agent-runner-execution.ts')
    if (!fs.existsSync(filePath)) {
      return false
    }

    const source = fs.readFileSync(filePath, 'utf8')
    if (source.includes('Ocbot is not set up yet — open the desktop app, go to Models, and add a provider before using channel replies.')) {
      return false
    }

    const currentBlock = `const fallbackText = isBilling
        ? BILLING_ERROR_USER_MESSAGE
        : isRateLimit
          ? buildRateLimitCooldownMessage(err)
          : isContextOverflow
            ? "⚠️ Context overflow — prompt too large for this model. Try a shorter message or a larger-context model."
            : isRoleOrderingError
              ? "⚠️ Message ordering conflict - please try again. If this persists, use /new to start a fresh session."
              : \`⚠️ Agent failed before reply: \${trimmedMessage}.\\nLogs: openclaw logs --follow\`;`

    const nextBlock = `const missingProviderAuth =
        trimmedMessage.includes("No API key found for provider")
        || trimmedMessage.includes("Configure auth for this agent");
      const fallbackText = isBilling
        ? BILLING_ERROR_USER_MESSAGE
        : isRateLimit
          ? buildRateLimitCooldownMessage(err)
          : isContextOverflow
            ? "⚠️ Context overflow — prompt too large for this model. Try a shorter message or a larger-context model."
            : isRoleOrderingError
              ? "⚠️ Message ordering conflict - please try again. If this persists, use /new to start a fresh session."
              : missingProviderAuth
                ? "⚠️ Ocbot is not set up yet — open the desktop app, go to Models, and add a provider before using channel replies."
                : \`⚠️ Agent failed before reply: \${trimmedMessage}.\\nLogs: openclaw logs --follow\`;`

    if (!source.includes(currentBlock)) {
      return false
    }

    fs.writeFileSync(filePath, source.replace(currentBlock, nextBlock), 'utf8')
    return true
  }

  // --- Config & Token ---

  private ensureConfig(): void {
    let config = createInitialConfig()
    let dirty = false

    if (fs.existsSync(this.configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
      } catch {
        config = createInitialConfig()
        dirty = true
      }
    } else {
      dirty = true
    }

    const browserConfig = asRecord(config.browser)
    if (!('browser' in config) || shouldPromoteManagedBrowser(browserConfig)) {
      config.browser = createManagedBrowserConfig()
      dirty = true
    }

    const gw = (config.gateway as Record<string, unknown>) || {}
    const auth = asRecord(gw.auth)
    if (gw.mode !== 'local' || gw.bind !== 'loopback' || auth.mode !== 'none') {
      config.gateway = {
        ...gw,
        mode: 'local',
        bind: 'loopback',
        auth: {
          ...auth,
          mode: 'none',
        },
      }
      dirty = true
    }

    const controlUi = asRecord((config.gateway as Record<string, unknown>)?.controlUi)
    const allowedOrigins = Array.isArray(controlUi.allowedOrigins)
      ? controlUi.allowedOrigins.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      : []
    const nextAllowedOrigins = allowedOrigins.includes('null') ? allowedOrigins : [...allowedOrigins, 'null']

    if (
      nextAllowedOrigins.length !== allowedOrigins.length
      || controlUi.allowInsecureAuth !== true
      || controlUi.dangerouslyDisableDeviceAuth !== true
    ) {
      config.gateway = {
        ...asRecord(config.gateway),
        controlUi: {
          ...controlUi,
          allowedOrigins: nextAllowedOrigins,
          allowInsecureAuth: true,
          dangerouslyDisableDeviceAuth: true,
        },
      }
      dirty = true
    }

    // Ensure Ocbot branding in ui.assistant
    const ui = (config.ui as Record<string, unknown>) || {}
    const assistant = (ui.assistant as Record<string, unknown>) || {}
    if (!assistant.name || assistant.name === 'OpenClaw') {
      assistant.name = 'Ocbot'
      ui.assistant = assistant
      config.ui = ui
      dirty = true
    }
    if (!ui.seamColor) {
      ui.seamColor = '#7c3aed'
      config.ui = ui
      dirty = true
    }

    const runtime = this.resolveRuntime()
    const sanitizedConfig = this.sanitizeRuntimeConfig(config, runtime.root)
    if (sanitizedConfig !== config) {
      config = sanitizedConfig
      dirty = true
    }

    if (dirty) {
      this.writeConfigObject(config)
    }
  }

  private readConfigObject(): Record<string, unknown> {
    if (!fs.existsSync(this.configPath)) {
      return {}
    }

    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
    } catch {
      return {}
    }
  }

  private writeConfigObject(config: Record<string, unknown>): void {
    this.atomicWriteJson(this.configPath, config)
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : ''
  }

  private readPolicy(value: unknown, fallback: DesktopChannelPolicy): DesktopChannelPolicy {
    if (
      value === 'open'
      || value === 'disabled'
      || value === 'pairing'
      || value === 'allowlist'
    ) {
      return value
    }
    return fallback
  }

  private readNestedDmPolicy(channelConfig: Record<string, unknown>): DesktopChannelPolicy {
    const dm = asRecord(channelConfig.dm)
    return this.readPolicy(dm.policy, DEFAULT_CHANNEL_CONFIG.dmPolicy)
  }

  private hasNestedDmPolicy(channelConfig: Record<string, unknown>): boolean {
    return isRecord(channelConfig.dm)
  }

  private resolveCredentialsDir(): string {
    return path.join(this.stateDir, 'credentials')
  }

  private resolvePairingPath(channelKey: string): string {
    return path.join(this.resolveCredentialsDir(), `${this.safeChannelKey(channelKey)}-pairing.json`)
  }

  private sanitizeRuntimeConfig(config: Record<string, unknown>, runtimeRoot: string | null): Record<string, unknown> {
    const nextConfig = { ...config }
    let changed = false

    const plugins = asRecord(nextConfig.plugins)
    const pluginEntries = { ...asRecord(plugins.entries) }
    const channels = { ...asRecord(nextConfig.channels) }

    const bundledWeixinDir = runtimeRoot ? path.join(runtimeRoot, 'extensions', 'openclaw-weixin') : ''
    const stateWeixinDir = path.join(this.stateDir, 'extensions', 'openclaw-weixin')
    if (bundledWeixinDir && fs.existsSync(bundledWeixinDir) && fs.existsSync(stateWeixinDir)) {
      try {
        fs.rmSync(stateWeixinDir, { recursive: true, force: true })
        changed = true
      } catch (error) {
        console.warn('[RuntimeManager] Failed to remove stale state plugin override:', error)
      }
    }

    for (const pluginId of Object.keys(pluginEntries)) {
      if (this.hasRuntimePlugin(runtimeRoot, pluginId)) {
        continue
      }

      delete pluginEntries[pluginId]
      changed = true

      if (pluginId in channels) {
        delete channels[pluginId]
      }
    }

    for (const channelKey of Object.keys(channels)) {
      const isPluginBackedChannel = channelKey in pluginEntries || channelKey.startsWith('openclaw-')
      if (!isPluginBackedChannel) {
        continue
      }

      if (this.hasRuntimePlugin(runtimeRoot, channelKey)) {
        continue
      }

      delete channels[channelKey]
      changed = true
    }

    if (!changed) {
      return config
    }

    nextConfig.plugins = {
      ...plugins,
      entries: pluginEntries,
    }
    nextConfig.channels = channels
    return nextConfig
  }

  private hasRuntimePlugin(runtimeRoot: string | null, pluginId: string): boolean {
    const candidates = [
      runtimeRoot ? path.join(runtimeRoot, 'extensions', pluginId) : '',
      path.join(this.stateDir, 'extensions', pluginId),
    ]

    return candidates.some((candidate) =>
      Boolean(candidate) && fs.existsSync(path.join(candidate, 'openclaw.plugin.json')),
    )
  }

  private resolveAllowFromPath(channelKey: string, accountId?: string): string {
    const base = this.safeChannelKey(channelKey)
    const normalizedAccountId = typeof accountId === 'string' ? accountId.trim().toLowerCase() : ''
    if (!normalizedAccountId || normalizedAccountId === 'default') {
      return path.join(this.resolveCredentialsDir(), `${base}-allowFrom.json`)
    }

    const safeAccountId = normalizedAccountId.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_')
    return path.join(this.resolveCredentialsDir(), `${base}-${safeAccountId}-allowFrom.json`)
  }

  private safeChannelKey(channelKey: string): string {
    const normalized = channelKey.trim().toLowerCase().replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_')
    if (!normalized || normalized === '_') {
      throw new Error('Invalid pairing channel')
    }
    return normalized
  }

  private readPairingFile(channelKey: string): DesktopPairingRequest[] {
    const file = this.readJsonFile<{ version: number; requests: DesktopPairingRequest[] }>(
      this.resolvePairingPath(channelKey),
      { version: 1, requests: [] },
    )

    return Array.isArray(file.requests) ? file.requests : []
  }

  private writePairingFile(channelKey: string, requests: DesktopPairingRequest[]): void {
    this.atomicWriteJson(this.resolvePairingPath(channelKey), {
      version: 1,
      requests,
    })
  }

  private readAllowFromFile(channelKey: string, accountId?: string): string[] {
    const file = this.readJsonFile<{ version: number; allowFrom: string[] }>(
      this.resolveAllowFromPath(channelKey, accountId),
      { version: 1, allowFrom: [] },
    )

    return Array.isArray(file.allowFrom) ? file.allowFrom.filter(value => typeof value === 'string') : []
  }

  private writeAllowFromFile(channelKey: string, allowFrom: string[], accountId?: string): void {
    this.atomicWriteJson(this.resolveAllowFromPath(channelKey, accountId), {
      version: 1,
      allowFrom,
    })
  }

  private readJsonFile<T>(filePath: string, fallback: T): T {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
    } catch {
      return fallback
    }
  }

  private atomicWriteJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const content = JSON.stringify(value, null, 2) + '\n'
    const tmpPath = `${filePath}.tmp-${Date.now()}`
    fs.writeFileSync(tmpPath, content, 'utf8')
    fs.renameSync(tmpPath, filePath)
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

    const stdout = ('stdout' in child ? child.stdout : null) as NodeJS.ReadableStream | null
    if (stdout) {
      stdout.on('data', handle)
    }
    const stderr = ('stderr' in child ? child.stderr : null) as NodeJS.ReadableStream | null
    if (stderr) {
      stderr.on('data', handle)
    }
  }

  private attachExitHandler(child: GatewayProcess): void {
    const childEvents = child as NodeJS.EventEmitter
    let restartScheduled = false

    const scheduleRestart = () => {
      if (this.intentionallyStoppedGateways.has(child as object)) {
        return
      }
      if (restartScheduled || this.shutdownRequested) {
        return
      }
      restartScheduled = true
      console.log('[RuntimeManager] Restarting gateway in 3s...')
      this._status = 'error'
      setTimeout(() => {
        if (!this.shutdownRequested) {
          this.start().catch((err) => console.error('[RuntimeManager] Restart failed:', err))
        }
      }, 3000)
    }

    childEvents.once('error', (error: unknown) => {
      console.error('[RuntimeManager] Gateway process error:', error)
      this.gateway = null
      scheduleRestart()
    })

    childEvents.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      console.log(`[RuntimeManager] Gateway exited (code ${code}, signal ${signal ?? 'none'})`)
      this.gateway = null
      scheduleRestart()
    })
  }

  private killGateway(): void {
    if (!this.gateway) return
    try {
      this.intentionallyStoppedGateways.add(this.gateway as object)
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

  private async waitForGatewayStartup(
    child: GatewayProcess,
    port: number,
    timeoutMs: number,
  ): Promise<string | null> {
    const childEvents = child as NodeJS.EventEmitter
    const earlyExit = new Promise<string>((resolve) => {
      childEvents.once('error', (error: unknown) => {
        resolve(`Gateway failed to launch: ${error instanceof Error ? error.message : String(error)}`)
      })
      childEvents.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        resolve(
          `Gateway exited before becoming healthy (code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''})`,
        )
      })
    })

    const healthCheck = this.waitForHealthy(port, timeoutMs).then((ready) => {
      return ready ? null : 'Gateway did not become healthy in time'
    })

    return await Promise.race([healthCheck, earlyExit])
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
    const serverEvents = server as unknown as NodeJS.EventEmitter
    serverEvents.once('error', () => resolve(false))
    serverEvents.once('listening', () => { server.close(() => resolve(true)) })
    server.listen(port, '127.0.0.1')
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
