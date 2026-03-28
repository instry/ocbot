const fs = require('node:fs')
const path = require('node:path')

const { bundledRuntimeRoot } = require('./common.cjs')

function findMacAppBundle(appOutDir) {
  const entries = fs.readdirSync(appOutDir, { withFileTypes: true })
  const appDir = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
  if (!appDir) {
    throw new Error(`No macOS app bundle found in ${appOutDir}`)
  }
  return path.join(appOutDir, appDir.name)
}

function resolvePackagedResourcesRoot(context = {}) {
  const appOutDir = context.appOutDir
  if (!appOutDir) {
    throw new Error('electron-builder afterPack context is missing appOutDir')
  }

  if (context.electronPlatformName === 'darwin') {
    return path.join(findMacAppBundle(appOutDir), 'Contents', 'Resources')
  }

  return path.join(appOutDir, 'resources')
}

async function afterPack(context = {}) {
  const sourceNodeModules = path.join(bundledRuntimeRoot, 'node_modules')
  if (!fs.existsSync(sourceNodeModules)) {
    throw new Error(`Bundled OpenClaw node_modules not found: ${sourceNodeModules}`)
  }

  const packagedResourcesRoot = resolvePackagedResourcesRoot(context)
  const packagedRuntimeRoot = path.join(packagedResourcesRoot, 'openclaw')
  const packagedNodeModules = path.join(packagedRuntimeRoot, 'node_modules')

  if (!fs.existsSync(packagedRuntimeRoot)) {
    throw new Error(`Packaged OpenClaw runtime not found: ${packagedRuntimeRoot}`)
  }

  fs.rmSync(packagedNodeModules, { recursive: true, force: true })
  fs.cpSync(sourceNodeModules, packagedNodeModules, { recursive: true, force: true })
  console.log(`[OpenClaw bundle] Restored node_modules into packaged runtime at ${packagedNodeModules}`)
}

module.exports = afterPack

if (require.main === module) {
  Promise.resolve(afterPack()).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
