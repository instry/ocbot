const fs = require('node:fs')
const path = require('node:path')

const { bundledRuntimeRoot, normalizeArchName } = require('./common.cjs')

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

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true })
}

function walkDirectory(rootPath, visitor) {
  if (!fs.existsSync(rootPath)) {
    return
  }

  const stack = [rootPath]
  while (stack.length > 0) {
    const currentPath = stack.pop()
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      const shouldDescend = visitor(entryPath, entry)
      if (shouldDescend !== false && entry.isDirectory()) {
        stack.push(entryPath)
      }
    }
  }
}

function pruneNodeModules(nodeModulesRoot) {
  const removableDirectories = new Set([
    '__tests__',
    '__mocks__',
    'test',
    'tests',
    'example',
    'examples',
    '.github',
  ])
  const removableFiles = [/\.md$/i, /\.markdown$/i, /\.map$/i]

  walkDirectory(nodeModulesRoot, (entryPath, entry) => {
    if (entry.isDirectory() && removableDirectories.has(entry.name)) {
      removeIfExists(entryPath)
      return false
    }

    if (entry.isFile() && removableFiles.some((pattern) => pattern.test(entry.name))) {
      removeIfExists(entryPath)
      return false
    }

    return true
  })
}

function pruneRuntimeDist(runtimeDistRoot) {
  walkDirectory(runtimeDistRoot, (entryPath, entry) => {
    if (entry.isFile() && entry.name.endsWith('.map')) {
      removeIfExists(entryPath)
      return false
    }

    return true
  })
}

function pruneBundledPluginHostPackage(hostPackageRoot) {
  if (!fs.existsSync(hostPackageRoot)) {
    return
  }

  const removableFiles = [
    /\.map$/i,
    /\.md$/i,
    /\.markdown$/i,
    /\.mdx$/i,
    /\.ts$/i,
    /\.mts$/i,
    /\.cts$/i,
  ]

  walkDirectory(hostPackageRoot, (entryPath, entry) => {
    if (entry.isFile() && removableFiles.some((pattern) => pattern.test(entry.name))) {
      removeIfExists(entryPath)
      return false
    }

    return true
  })
}

function pruneBundledPluginHostPackages(packagedRuntimeRoot) {
  const extensionsRoot = path.join(packagedRuntimeRoot, 'extensions')
  if (!fs.existsSync(extensionsRoot)) {
    return
  }

  for (const entry of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    pruneBundledPluginHostPackage(path.join(extensionsRoot, entry.name, 'node_modules', 'openclaw'))
  }
}

function pruneKoffiBinaries(nodeModulesRoot, platform, arch) {
  const koffiBuildRoot = path.join(nodeModulesRoot, 'koffi', 'build', 'koffi')
  if (!fs.existsSync(koffiBuildRoot)) {
    return
  }

  const targetName = `${platform}_${arch}`
  for (const entry of fs.readdirSync(koffiBuildRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    if (entry.name === targetName) {
      continue
    }
    removeIfExists(path.join(koffiBuildRoot, entry.name))
  }
}

function prunePackagedRuntime(context = {}) {
  const packagedResourcesRoot = resolvePackagedResourcesRoot(context)
  const packagedRuntimeRoot = path.join(packagedResourcesRoot, 'openclaw')
  const packagedNodeModules = path.join(packagedRuntimeRoot, 'node_modules')
  const packagedRuntimeDist = path.join(packagedRuntimeRoot, 'dist')

  if (!fs.existsSync(packagedRuntimeRoot)) {
    throw new Error(`Packaged OpenClaw runtime not found: ${packagedRuntimeRoot}`)
  }

  removeIfExists(path.join(packagedRuntimeRoot, 'README.md'))
  removeIfExists(path.join(packagedRuntimeRoot, 'CHANGELOG.md'))
  removeIfExists(path.join(packagedRuntimeRoot, 'package-lock.json'))
  removeIfExists(path.join(packagedRuntimeRoot, 'docs'))
  removeIfExists(path.join(packagedRuntimeRoot, 'skills'))

  pruneNodeModules(packagedNodeModules)
  pruneRuntimeDist(packagedRuntimeDist)
  pruneBundledPluginHostPackages(packagedRuntimeRoot)

  const targetPlatform = context.electronPlatformName || process.platform
  const targetArch = normalizeArchName(context.arch) || normalizeArchName(process.arch) || process.arch
  pruneKoffiBinaries(packagedNodeModules, targetPlatform, targetArch)
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
  fs.cpSync(sourceNodeModules, packagedNodeModules, {
    recursive: true,
    force: true,
    dereference: true,
  })
  prunePackagedRuntime(context)
  console.log(`[OpenClaw bundle] Restored node_modules into packaged runtime at ${packagedNodeModules}`)
}

module.exports = afterPack
module.exports.prunePackagedRuntime = prunePackagedRuntime

if (require.main === module) {
  Promise.resolve(afterPack()).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
