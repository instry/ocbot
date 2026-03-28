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

export type EngineStatus = 'not_installed' | 'ready' | 'starting' | 'running' | 'error'

const DEFAULT_PORT = 18789
const PORT_SCAN_LIMIT = 80
const BOOT_TIMEOUT_MS = 120_000
const HEALTH_INTERVAL_MS = 30_000

type DesktopChannelPlatform =
  | 'feishu'
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'whatsapp'
  | 'dingtalk'
  | 'qq'
  | 'wecom'
  | 'weixin'

type DesktopChannelPolicy = 'open' | 'disabled' | 'pairing' | 'allowlist'

type DesktopChannelConfig = {
  enabled: boolean
  appId?: string
  appSecret?: string
  domain?: string
  botToken?: string
  clientId?: string
  clientSecret?: string
  botId?: string
  secret?: string
  accountId?: string
  dmPolicy: DesktopChannelPolicy
  groupPolicy: DesktopChannelPolicy
}

type DesktopPairingRequest = {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

type ChannelConfigMap = {
  channelKey: string
  credentials: Partial<Record<keyof DesktopChannelConfig, string>>
  supportsDmPolicy?: boolean
  supportsGroupPolicy?: boolean
}

const DEFAULT_CHANNEL_CONFIG: DesktopChannelConfig = {
  enabled: false,
  dmPolicy: 'open',
  groupPolicy: 'open',
}

const PAIRING_PENDING_TTL_MS = 3_600_000

const CHANNEL_CONFIG_MAP: Record<DesktopChannelPlatform, ChannelConfigMap> = {
  feishu: {
    channelKey: 'feishu',
    credentials: { appId: 'appId', appSecret: 'appSecret' },
  },
  telegram: {
    channelKey: 'telegram',
    credentials: { botToken: 'botToken' },
  },
  discord: {
    channelKey: 'discord',
    credentials: { botToken: 'token' },
  },
  slack: {
    channelKey: 'slack',
    credentials: { botToken: 'botToken' },
  },
  whatsapp: {
    channelKey: 'whatsapp',
    credentials: {},
    supportsGroupPolicy: false,
  },
  dingtalk: {
    channelKey: 'dingtalk-connector',
    credentials: { clientId: 'clientId', clientSecret: 'clientSecret' },
  },
  qq: {
    channelKey: 'qqbot',
    credentials: { appId: 'appId', appSecret: 'clientSecret' },
  },
  wecom: {
    channelKey: 'wecom',
    credentials: { botId: 'botId', secret: 'secret' },
  },
  weixin: {
    channelKey: 'openclaw-weixin',
    credentials: { accountId: 'accountId' },
  },
}

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
  private weixinPluginEnsurePromise: Promise<boolean> | null = null
  private feishuInstallIsLark = false
  private feishuAuthModulePromise: Promise<FeishuAuthModule> | null = null

  constructor() {
    if (app.isPackaged) {
      // Production: use Electron userData
      const userDataPath = app.getPath('userData')
      this.baseDir = path.join(userDataPath, 'openclaw')
      this.stateDir = path.join(this.baseDir, 'state')
      this.logsDir = path.join(this.baseDir, 'logs')
    } else {
      // Dev: reuse existing ocbot/.openclaw/ so we get existing config/channels
      const ocbotRoot = path.resolve(app.getAppPath(), '..')
      const devState = path.join(ocbotRoot, '.openclaw')
      if (fs.existsSync(devState)) {
        this.baseDir = devState
        this.stateDir = devState
        this.logsDir = path.join(devState, 'logs')
      } else {
        // Fallback if .openclaw doesn't exist
        const userDataPath = app.getPath('userData')
        this.baseDir = path.join(userDataPath, 'openclaw-dev')
        this.stateDir = path.join(this.baseDir, 'state')
        this.logsDir = path.join(this.baseDir, 'logs')
      }
    }

    this.configPath = path.join(this.stateDir, 'openclaw.json')
    this.tokenPath = path.join(this.stateDir, 'gateway-token')
    this.portPath = path.join(this.stateDir, 'gateway-port.json')

    fs.mkdirSync(this.stateDir, { recursive: true })
    fs.mkdirSync(this.logsDir, { recursive: true })

    const runtime = this.resolveRuntime()
    if (runtime.root) {
      this.applyRuntimePatches(runtime.root)
    }
    this._status = runtime.root ? 'ready' : 'not_installed'
  }

  get status(): EngineStatus { return this._status }
  get gatewayPort(): number | null { return this.port }
  get gatewayToken(): string | null { return this.readToken() }
  getStateDir(): string { return this.stateDir }

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

  saveChannelConfig(platform: DesktopChannelPlatform, nextConfig: DesktopChannelConfig): DesktopChannelConfig {
    this.ensureConfig()
    const mapping = CHANNEL_CONFIG_MAP[platform]
    const config = this.readConfigObject()
    const channels = { ...asRecord(config.channels) }
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

    channels[mapping.channelKey] = nextChannel
    config.channels = channels
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

    this.applyRuntimePatches(runtime.root)
    return await this.ensureWeixinPluginReady(runtime.root)
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
    await this.ensureDefaultPlugins(runtime.root)
    this.applyRuntimePatches(runtime.root)

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

  async restart(): Promise<number> {
    this.stop()
    return await this.start()
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

  private async getFeishuAuthModule(): Promise<FeishuAuthModule> {
    if (!this.feishuAuthModulePromise) {
      this.feishuAuthModulePromise = import('@larksuite/openclaw-lark-tools/dist/utils/feishu-auth.js') as unknown as Promise<FeishuAuthModule>
    }
    return await this.feishuAuthModulePromise
  }

  private applyRuntimePatches(root: string): void {
    this.patchWeixinGatewayMethods(root)
    this.patchWebLoginProviderSelection(root)
    this.patchWebLoginParamSchema(root)
  }

  private async ensureDefaultPlugins(root: string): Promise<void> {
    await this.ensureWeixinPluginReady(root)
  }

  private async ensureWeixinPluginReady(root: string): Promise<boolean> {
    const filePath = this.resolvePluginSourceFile(root, 'openclaw-weixin', ['src', 'channel.ts'])
    if (fs.existsSync(filePath)) {
      this.ensurePluginEnabled('openclaw-weixin')
      this.patchWeixinGatewayMethods(root)
      return this.hasWeixinGatewayMethods(filePath)
    }

    if (this.weixinPluginEnsurePromise) {
      return await this.weixinPluginEnsurePromise
    }

    this.weixinPluginEnsurePromise = this.installWeixinPlugin(root)
    try {
      return await this.weixinPluginEnsurePromise
    } finally {
      this.weixinPluginEnsurePromise = null
    }
  }

  private hasWeixinGatewayMethods(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return false
    }

    const source = fs.readFileSync(filePath, 'utf8')
    return source.includes('web.login.start') && source.includes('web.login.wait')
  }

  private async installWeixinPlugin(root: string): Promise<boolean> {
    const entry = this.resolveEntry(root)
    if (!entry) {
      return false
    }

    const pluginSpec = '@tencent-weixin/openclaw-weixin'
    const result = await this.runOpenClawCommand(root, entry, ['plugins', 'install', pluginSpec])
    if (!result.ok) {
      console.warn(`[RuntimeManager] Failed to install ${pluginSpec}: ${result.output}`)
      return false
    }

    const filePath = this.resolvePluginSourceFile(root, 'openclaw-weixin', ['src', 'channel.ts'])
    if (!fs.existsSync(filePath)) {
      return false
    }

    this.ensurePluginEnabled('openclaw-weixin')
    this.patchWeixinGatewayMethods(root)
    return this.hasWeixinGatewayMethods(filePath)
  }

  private ensurePluginEnabled(pluginId: string): void {
    this.ensureConfig()
    const config = this.readConfigObject()
    const plugins = asRecord(config.plugins)
    const entries = { ...asRecord(plugins.entries) }
    const currentEntry = asRecord(entries[pluginId])
    if (currentEntry.enabled === true) {
      return
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
  }

  private async runOpenClawCommand(
    root: string,
    entry: string,
    args: string[],
  ): Promise<{ ok: boolean; output: string }> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OPENCLAW_HOME: root,
      OPENCLAW_STATE_DIR: this.stateDir,
      OPENCLAW_CONFIG_PATH: this.configPath,
      OPENCLAW_NO_RESPAWN: '1',
      OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(root, 'extensions'),
    }

    return await new Promise((resolve) => {
      const child = spawn(process.execPath, [entry, ...args], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let output = ''
      child.stdout?.on('data', (chunk) => { output += String(chunk) })
      child.stderr?.on('data', (chunk) => { output += String(chunk) })
      child.on('error', (error) => {
        resolve({ ok: false, output: `${output}\n${String(error)}`.trim() })
      })
      child.on('close', (code) => {
        resolve({ ok: code === 0, output: output.trim() })
      })
    })
  }

  private patchWeixinGatewayMethods(root: string): void {
    const filePath = this.resolvePluginSourceFile(root, 'openclaw-weixin', ['src', 'channel.ts'])
    if (!fs.existsSync(filePath)) {
      return
    }

    const source = fs.readFileSync(filePath, 'utf8')
    if (source.includes('gatewayMethods')) {
      return
    }

    const marker = 'configSchema: {'
    const index = source.indexOf(marker)
    if (index === -1) {
      return
    }

    const nextSource = source.slice(0, index)
      + 'gatewayMethods: ["web.login.start", "web.login.wait"],\n  '
      + source.slice(index)

    fs.writeFileSync(filePath, nextSource, 'utf8')
  }

  private patchWebLoginProviderSelection(root: string): void {
    const filePath = path.join(root, 'src', 'gateway', 'server-methods', 'web.ts')
    if (!fs.existsSync(filePath)) {
      return
    }

    const source = fs.readFileSync(filePath, 'utf8')
    const currentBlock = `const resolveWebLoginProvider = () =>
  listChannelPlugins().find((plugin) =>
    (plugin.gatewayMethods ?? []).some((method) => WEB_LOGIN_METHODS.has(method)),
  ) ?? null;
`

    const nextBlock = `function resolveRequestedProviderId(params: unknown): string | undefined {
  return typeof (params as { channel?: unknown }).channel === "string"
    ? (params as { channel?: string }).channel?.trim() || undefined
    : undefined;
}

const resolveWebLoginProvider = (params: unknown) => {
  const requestedProviderId = resolveRequestedProviderId(params);
  const providers = listChannelPlugins().filter((plugin) =>
    (plugin.gatewayMethods ?? []).some((method) => WEB_LOGIN_METHODS.has(method)),
  );
  if (requestedProviderId) {
    return providers.find((plugin) => plugin.id === requestedProviderId) ?? null;
  }
  return providers[0] ?? null;
};
`

    let nextSource = source

    if (!nextSource.includes('resolveRequestedProviderId')) {
      if (!nextSource.includes(currentBlock)) {
        return
      }

      nextSource = nextSource.replace(currentBlock, nextBlock)
    }

    nextSource = nextSource.replace(
      'const provider = resolveWebLoginProvider();',
      'const provider = resolveWebLoginProvider(params);',
    )

    if (nextSource === source) {
      return
    }

    fs.writeFileSync(filePath, nextSource, 'utf8')
  }

  private patchWebLoginParamSchema(root: string): void {
    const filePath = path.join(root, 'src', 'gateway', 'protocol', 'schema', 'channels.ts')
    if (!fs.existsSync(filePath)) {
      return
    }

    const source = fs.readFileSync(filePath, 'utf8')
    if (source.includes('channel: Type.Optional(Type.String())')) {
      return
    }

    const nextSource = source
      .replace(
        `export const WebLoginStartParamsSchema = Type.Object(
  {
    force: Type.Optional(Type.Boolean()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    verbose: Type.Optional(Type.Boolean()),
    accountId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
`,
        `export const WebLoginStartParamsSchema = Type.Object(
  {
    force: Type.Optional(Type.Boolean()),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    verbose: Type.Optional(Type.Boolean()),
    accountId: Type.Optional(Type.String()),
    channel: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
`,
      )
      .replace(
        `export const WebLoginWaitParamsSchema = Type.Object(
  {
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    accountId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
`,
        `export const WebLoginWaitParamsSchema = Type.Object(
  {
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    accountId: Type.Optional(Type.String()),
    channel: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
`,
      )

    fs.writeFileSync(filePath, nextSource, 'utf8')
  }

  private resolvePluginSourceFile(root: string, pluginId: string, pathParts: string[]): string {
    const candidates = [
      path.join(this.stateDir, 'extensions', pluginId, ...pathParts),
      path.join(root, 'extensions', pluginId, ...pathParts),
    ]

    return candidates.find(candidate => fs.existsSync(candidate)) ?? candidates[0]
  }

  // --- Config & Token ---

  private ensureConfig(): void {
    let config: Record<string, unknown> = {}
    let dirty = false

    if (fs.existsSync(this.configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
      } catch { /* start fresh on parse error */ }
    } else {
      dirty = true
    }

    // Ensure gateway.mode=local
    const gw = (config.gateway as Record<string, unknown>) || {}
    if (!gw.mode) {
      config.gateway = { ...gw, mode: 'local' }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
