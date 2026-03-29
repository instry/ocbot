import fs from 'node:fs'
import path from 'node:path'

export type WeixinRuntimeDeps = {
  ensurePluginEnabled: (pluginId: string) => boolean
  resolvePluginSourceFile: (root: string, pluginId: string, pathParts: string[]) => string
}

export type WeixinPluginReadyResult = {
  ready: boolean
  changed: boolean
}

const WEIXIN_PLUGIN_ID = 'openclaw-weixin'
export class WeixinRuntime {
  constructor(private readonly deps: WeixinRuntimeDeps) {}

  async isQrLoginSupported(root: string): Promise<boolean> {
    const result = await this.ensurePluginReady(root)
    return result.ready
  }

  applyGatewayPatches(): boolean {
    return false
  }

  async ensurePluginReady(root: string): Promise<WeixinPluginReadyResult> {
    const readyMarkerPath = path.join(root, '.ocbot-weixin-ready.json')
    if (fs.existsSync(readyMarkerPath)) {
      const enabledChanged = this.deps.ensurePluginEnabled(WEIXIN_PLUGIN_ID)
      return { ready: true, changed: enabledChanged }
    }

    const filePath = this.deps.resolvePluginSourceFile(root, WEIXIN_PLUGIN_ID, ['src', 'channel.ts'])
    if (!fs.existsSync(filePath)) {
      return { ready: false, changed: false }
    }

    const runtimeReady = this.hasGatewayMethods(filePath)
      && this.hasProviderSelectionPatch(root)
      && this.hasParamSchemaPatch(root)
    if (!runtimeReady) {
      return { ready: false, changed: false }
    }

    const enabledChanged = this.deps.ensurePluginEnabled(WEIXIN_PLUGIN_ID)
    return { ready: true, changed: enabledChanged }
  }

  private hasGatewayMethods(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return false
    }

    const source = fs.readFileSync(filePath, 'utf8')
    return source.includes('web.login.start') && source.includes('web.login.wait')
  }

  private hasProviderSelectionPatch(root: string): boolean {
    const filePath = path.join(root, 'src', 'gateway', 'server-methods', 'web.ts')
    if (!fs.existsSync(filePath)) {
      return false
    }

    const source = fs.readFileSync(filePath, 'utf8')
    return source.includes('resolveRequestedProviderId')
      && source.includes('const provider = resolveWebLoginProvider(params);')
  }

  private hasParamSchemaPatch(root: string): boolean {
    const filePath = path.join(root, 'src', 'gateway', 'protocol', 'schema', 'channels.ts')
    if (!fs.existsSync(filePath)) {
      return false
    }

    const source = fs.readFileSync(filePath, 'utf8')
    return source.includes('channel: Type.Optional(Type.String())')
  }
}
