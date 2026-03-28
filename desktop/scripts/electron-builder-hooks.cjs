const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  assertSupportedRuntimeTarget,
  bundledRuntimeRoot,
  commandExists,
  defaultOpenClawSourceRoot,
  getConfiguredOpenClawVersion,
  getDesktopVersion,
  normalizeArchName,
  normalizePlatformName,
  readCliOption,
  resolveCommand,
  run,
  syncPackageVersionFiles,
} = require('./common.cjs')

function resolvePnpmRunner() {
  const corepack = resolveCommand('corepack')
  if (commandExists(corepack, ['pnpm', '--version'])) {
    return { command: corepack, prefixArgs: ['pnpm'] }
  }

  const pnpm = resolveCommand('pnpm')
  if (commandExists(pnpm)) {
    return { command: pnpm, prefixArgs: [] }
  }

  throw new Error('pnpm is required to build the bundled OpenClaw runtime')
}

function runPnpm(args, options = {}) {
  const runner = resolvePnpmRunner()
  run(runner.command, [...runner.prefixArgs, ...args], options)
}

function resolveOpenClawSourceRoot() {
  const configuredRoot = process.env.OPENCLAW_SRC
  return path.resolve(configuredRoot || defaultOpenClawSourceRoot)
}

function resolveOutputRoot() {
  const configuredRoot = process.env.OPENCLAW_BUNDLED_RUNTIME_DIR
  return path.resolve(configuredRoot || bundledRuntimeRoot)
}

function resolveRuntimeTarget(context = {}) {
  const cliPlatform = readCliOption(process.argv.slice(2), '--platform')
  const cliArch = readCliOption(process.argv.slice(2), '--arch')
  const platform = normalizePlatformName(cliPlatform || context.electronPlatformName || process.platform)
  let arch = normalizeArchName(cliArch || context.arch || process.arch)

  if (arch === 'universal') {
    arch = normalizeArchName(process.arch)
  }

  assertSupportedRuntimeTarget(platform, arch)
  return { platform, arch }
}

function assertPathExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} not found: ${targetPath}`)
  }
}

function hasBuiltOpenClaw(sourceRoot) {
  const entryJs = path.join(sourceRoot, 'dist', 'entry.js')
  const entryMjs = path.join(sourceRoot, 'dist', 'entry.mjs')
  const controlUiIndex = path.join(sourceRoot, 'dist', 'control-ui', 'index.html')
  const bootstrap = path.join(sourceRoot, 'openclaw.mjs')
  return fs.existsSync(bootstrap)
    && (fs.existsSync(entryJs) || fs.existsSync(entryMjs))
    && fs.existsSync(controlUiIndex)
}

function readOpenClawSourceVersion(sourceRoot) {
  const packageJsonPath = path.join(sourceRoot, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`OpenClaw package.json not found: ${packageJsonPath}`)
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  if (typeof packageJson.version !== 'string' || packageJson.version.trim() === '') {
    throw new Error(`OpenClaw version is missing in ${packageJsonPath}`)
  }
  return packageJson.version.trim()
}

function ensureConfiguredOpenClawVersion(sourceRoot) {
  const desktopVersion = getDesktopVersion()
  const expectedVersion = getConfiguredOpenClawVersion()
  const actualVersion = readOpenClawSourceVersion(sourceRoot)

  if (actualVersion !== expectedVersion) {
    throw new Error(
      `OpenClaw version mismatch for desktop ${desktopVersion}: expected ${expectedVersion}, found ${actualVersion} in ${sourceRoot}`,
    )
  }
}

function ensureOpenClawBuild(sourceRoot) {
  syncPackageVersionFiles()
  assertPathExists(sourceRoot, 'OpenClaw source directory')
  assertPathExists(path.join(sourceRoot, 'package.json'), 'OpenClaw package.json')
  assertPathExists(path.join(sourceRoot, 'openclaw.mjs'), 'OpenClaw bootstrap entry')
  ensureConfiguredOpenClawVersion(sourceRoot)

  if (hasBuiltOpenClaw(sourceRoot)) {
    console.log(`[OpenClaw bundle] Reusing existing build from ${sourceRoot}`)
    return
  }

  console.log(`[OpenClaw bundle] Building OpenClaw from ${sourceRoot}`)
  runPnpm(['install', '--frozen-lockfile'], { cwd: sourceRoot })
  runPnpm(['build'], { cwd: sourceRoot })
  runPnpm(['ui:build'], { cwd: sourceRoot })

  if (!hasBuiltOpenClaw(sourceRoot)) {
    throw new Error(`OpenClaw build output is incomplete: ${sourceRoot}`)
  }
}

function prepareBundledRuntime(sourceRoot, outputRoot, runtimeTarget) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ocbot-openclaw-runtime-'))
  const packDir = path.join(tempRoot, 'pack')
  const extractDir = path.join(tempRoot, 'extract')
  fs.mkdirSync(packDir, { recursive: true })
  fs.mkdirSync(extractDir, { recursive: true })

  try {
    console.log(`[OpenClaw bundle] Packing OpenClaw from ${sourceRoot}`)
    run(resolveCommand('npm'), ['pack', '--pack-destination', packDir], { cwd: sourceRoot })

    const tarballName = fs.readdirSync(packDir).find((entry) => entry.endsWith('.tgz'))
    if (!tarballName) {
      throw new Error(`No OpenClaw tarball produced in ${packDir}`)
    }

    const tarballPath = path.join(packDir, tarballName)
    run('tar', ['-xzf', tarballPath, '-C', extractDir])

    const packageRoot = path.join(extractDir, 'package')
    assertPathExists(packageRoot, 'Packed OpenClaw runtime')

    fs.rmSync(outputRoot, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(outputRoot), { recursive: true })
    fs.cpSync(packageRoot, outputRoot, { recursive: true, force: true })
    fs.rmSync(path.join(outputRoot, 'node_modules'), { recursive: true, force: true })
    fs.rmSync(path.join(outputRoot, 'package-lock.json'), { force: true })

    console.log(`[OpenClaw bundle] Installing production dependencies into ${outputRoot}`)
    run(resolveCommand('npm'), ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: outputRoot,
      env: {
        ...process.env,
        npm_config_platform: runtimeTarget.platform,
        npm_config_arch: runtimeTarget.arch,
        npm_config_loglevel: process.env.npm_config_loglevel || 'warn',
      },
    })

    const runtimeEntryJs = path.join(outputRoot, 'dist', 'entry.js')
    const runtimeEntryMjs = path.join(outputRoot, 'dist', 'entry.mjs')
    const runtimeControlUiIndex = path.join(outputRoot, 'dist', 'control-ui', 'index.html')
    const runtimeBootstrap = path.join(outputRoot, 'openclaw.mjs')
    const runtimeNodeModules = path.join(outputRoot, 'node_modules')

    if (!fs.existsSync(runtimeBootstrap)) {
      throw new Error(`Bundled runtime is missing openclaw.mjs: ${outputRoot}`)
    }

    if (!fs.existsSync(runtimeEntryJs) && !fs.existsSync(runtimeEntryMjs)) {
      throw new Error(`Bundled runtime is missing dist/entry.*: ${outputRoot}`)
    }

    if (!fs.existsSync(runtimeControlUiIndex)) {
      throw new Error(`Bundled runtime is missing dist/control-ui/index.html: ${outputRoot}`)
    }

    if (!fs.existsSync(runtimeNodeModules)) {
      throw new Error(`Bundled runtime is missing node_modules: ${outputRoot}`)
    }

    console.log(`[OpenClaw bundle] Bundled runtime ready at ${outputRoot}`)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function prepareOpenClawRuntime(context = {}) {
  const sourceRoot = resolveOpenClawSourceRoot()
  const outputRoot = resolveOutputRoot()
  const runtimeTarget = resolveRuntimeTarget(context)
  console.log(`[OpenClaw bundle] Preparing runtime for ${runtimeTarget.platform}/${runtimeTarget.arch}`)
  ensureOpenClawBuild(sourceRoot)
  prepareBundledRuntime(sourceRoot, outputRoot, runtimeTarget)
}

async function beforePack(context = {}) {
  if (process.env.OCBOT_SKIP_OPENCLAW_PREP === '1') {
    console.log('[OpenClaw bundle] Skipping bundled runtime preparation')
    return
  }

  prepareOpenClawRuntime(context)
}

module.exports = beforePack

if (require.main === module) {
  Promise.resolve(beforePack()).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
