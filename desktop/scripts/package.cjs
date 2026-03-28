const {
  getConfiguredOpenClawVersion,
  getDesktopVersion,
  hasCliFlag,
  macArchitectures,
  normalizeArchName,
  normalizePlatformName,
  projectRoot,
  readCliOption,
  resolveCommand,
  run,
  syncPackageVersionFiles,
  toElectronBuilderPlatformFlag,
  windowsArchitectures,
} = require('./common.cjs')

const argv = process.argv.slice(2)

function printHelp() {
  console.log(`Usage:
  node scripts/package.cjs [options]

Options:
  --platform <mac|win|all>
  --arch <x64|arm64|ia32|all>
  --target <app|dmg|exe|all>
  --publish <never|always>
  --skip-build
  --skip-openclaw
  --dry-run
  --help
`)
}

function unique(values) {
  return [...new Set(values)]
}

function expandPlatforms(value) {
  if (!value || value === 'all') {
    return ['darwin', 'win32']
  }

  return value
    .split(',')
    .map((entry) => normalizePlatformName(entry))
    .filter(Boolean)
}

function expandArchitectures(platform, value) {
  const allowedArchitectures = platform === 'darwin' ? new Set(macArchitectures) : new Set(windowsArchitectures)
  if (!value || value === 'all') {
    return [...allowedArchitectures]
  }

  const architectures = value
    .split(',')
    .map((entry) => normalizeArchName(entry))
    .filter((entry) => Boolean(entry) && allowedArchitectures.has(entry))

  return unique(architectures)
}

function expandTargets(platform, value) {
  const defaultTargets = platform === 'darwin' ? ['app', 'dmg'] : ['exe']
  if (!value || value === 'all') {
    return defaultTargets
  }

  const rawTargets = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  const allowedTargets = platform === 'darwin'
    ? new Set(['app', 'dmg'])
    : new Set(['exe'])

  const targets = rawTargets.filter((entry) => allowedTargets.has(entry))
  return unique(targets)
}

function getTaskLabel(task) {
  const platformLabel = task.platform === 'darwin' ? 'mac' : 'win'
  return `${platformLabel}/${task.arch}/${task.target}`
}

function resolveTasks(options) {
  const platforms = expandPlatforms(options.platform)
  if (platforms.length === 0) {
    throw new Error(`Unsupported platform: ${options.platform ?? 'unknown'}`)
  }

  const tasks = []
  for (const platform of platforms) {
    const architectures = expandArchitectures(platform, options.arch)
    if (architectures.length === 0) {
      throw new Error(`Unsupported arch for ${platform}: ${options.arch ?? 'unknown'}`)
    }

    const targets = expandTargets(platform, options.target)
    if (targets.length === 0) {
      throw new Error(`Unsupported target for ${platform}: ${options.target ?? 'unknown'}`)
    }

    for (const arch of architectures) {
      for (const target of targets) {
        tasks.push({ platform, arch, target })
      }
    }
  }

  return tasks
}

function buildElectronBuilderArgs(task, publish) {
  const args = ['exec', 'electron-builder', '--', '--config', 'electron-builder.yml', '--publish', publish]
  if (task.target === 'app') {
    args.push('--dir')
  }

  args.push(toElectronBuilderPlatformFlag(task.platform))

  if (task.target === 'dmg') {
    args.push('dmg')
  }

  if (task.target === 'exe') {
    args.push('nsis')
  }

  args.push(`--${task.arch}`)
  return args
}

function runDesktopBuild() {
  console.log('[package] Building desktop application')
  run(resolveCommand('npm'), ['run', 'build'], { cwd: projectRoot })
}

function runElectronBuilder(task, options) {
  const args = buildElectronBuilderArgs(task, options.publish)
  const env = {
    ...process.env,
  }

  if (options.skipOpenClaw) {
    env.OCBOT_SKIP_OPENCLAW_PREP = '1'
  }

  console.log(`[package] Packaging ${getTaskLabel(task)}`)
  console.log(`[package] npm ${args.join(' ')}`)

  if (options.dryRun) {
    return
  }

  run(resolveCommand('npm'), args, {
    cwd: projectRoot,
    env,
  })
}

function generateUpdateManifest(options) {
  if (options.dryRun) {
    return
  }

  console.log('[package] Generating update manifest')
  run(resolveCommand('node'), ['scripts/generate-update-manifest.cjs'], {
    cwd: projectRoot,
    env: process.env,
  })
}

function main() {
  if (hasCliFlag(argv, '--help')) {
    printHelp()
    return
  }

  const options = {
    arch: readCliOption(argv, '--arch'),
    dryRun: hasCliFlag(argv, '--dry-run'),
    platform: readCliOption(argv, '--platform'),
    publish: readCliOption(argv, '--publish') || 'never',
    skipBuild: hasCliFlag(argv, '--skip-build'),
    skipOpenClaw: hasCliFlag(argv, '--skip-openclaw'),
    target: readCliOption(argv, '--target'),
  }

  const tasks = resolveTasks(options)
  syncPackageVersionFiles()
  console.log(`[package] Desktop version ${getDesktopVersion()}`)
  console.log(`[package] OpenClaw version ${getConfiguredOpenClawVersion()}`)
  console.log(`[package] Planned tasks: ${tasks.map((task) => getTaskLabel(task)).join(', ')}`)

  if (!options.skipBuild) {
    runDesktopBuild()
  }

  for (const task of tasks) {
    runElectronBuilder(task, options)
  }

  generateUpdateManifest(options)
}

main()
