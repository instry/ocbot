const fs = require('node:fs')
const path = require('node:path')

const runtimeHooks = require('./electron-builder-hooks.cjs')
const {
  bundledRuntimeRoot,
  getConfiguredOpenClawCommit,
  getConfiguredOpenClawVersion,
  getDesktopVersion,
} = require('./common.cjs')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function hasFeishuSupport(runtimeRoot) {
  const candidates = [
    path.join(runtimeRoot, 'src', 'config', 'bundled-channel-config-metadata.generated.ts'),
    path.join(runtimeRoot, 'src', 'channels', 'plugins', 'contracts', 'registry.ts'),
  ]

  return candidates.some((filePath) => {
    if (!fs.existsSync(filePath)) {
      return false
    }

    const source = fs.readFileSync(filePath, 'utf8')
    return source.includes('channelId: "feishu"') || source.includes('feishu: {')
  })
}

function shouldPrepareRuntime() {
  if (!fs.existsSync(bundledRuntimeRoot)) {
    return true
  }

  const entryPath = path.join(bundledRuntimeRoot, 'openclaw.mjs')
  const runtimePackagePath = path.join(bundledRuntimeRoot, 'package.json')
  const markerPath = path.join(bundledRuntimeRoot, '.ocbot-runtime-ready.json')
  if (!fs.existsSync(entryPath) || !fs.existsSync(runtimePackagePath) || !fs.existsSync(markerPath)) {
    return true
  }

  try {
    const runtimePackage = readJson(runtimePackagePath)
    const marker = readJson(markerPath)
    if (runtimePackage.version !== getConfiguredOpenClawVersion()) {
      return true
    }
    if (marker.desktopVersion !== getDesktopVersion()) {
      return true
    }
    if (marker.openclawVersion !== getConfiguredOpenClawVersion()) {
      return true
    }
    if (marker.openclawCommit !== getConfiguredOpenClawCommit()) {
      return true
    }
    if (!hasFeishuSupport(bundledRuntimeRoot)) {
      return true
    }
    return false
  } catch {
    return true
  }
}

async function main() {
  if (!shouldPrepareRuntime()) {
    console.log('[OpenClaw bundle] Bundled runtime already current')
    return
  }

  process.env.OCBOT_ALLOW_DIRTY_OPENCLAW = process.env.OCBOT_ALLOW_DIRTY_OPENCLAW || '1'
  try {
    await runtimeHooks({ electronPlatformName: process.platform, arch: process.arch })
    return
  } catch (error) {
    console.warn(`[OpenClaw bundle] Falling back to source-tree runtime sync: ${error instanceof Error ? error.message : String(error)}`)
  }

  const sourceRoot = runtimeHooks.resolveOpenClawSourceRoot()
  const outputRoot = runtimeHooks.resolveOutputRoot()
  const runtimeTarget = runtimeHooks.resolveRuntimeTarget({
    electronPlatformName: process.platform,
    arch: process.arch,
  })

  fs.rmSync(outputRoot, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(outputRoot), { recursive: true })
  fs.cpSync(sourceRoot, outputRoot, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !sourcePath.includes(`${path.sep}.git${path.sep}`),
  })

  const tempRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ocbot-openclaw-dev-'))
  try {
    runtimeHooks.prepareBundledExternalPlugin({
      tempRoot,
      outputRoot,
      runtimeTarget,
      pluginId: 'openclaw-weixin',
      npmSpec: '@tencent-weixin/openclaw-weixin',
    })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
  runtimeHooks.patchBundledWeixinPlugin(outputRoot)
  runtimeHooks.writeBundledRuntimeMarker(sourceRoot, outputRoot)
}

Promise.resolve(main()).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
