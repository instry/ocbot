const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const defaultOpenClawSourceRoot = path.resolve(projectRoot, '..', '..', 'openclaw')
const bundledRuntimeRoot = path.resolve(projectRoot, 'resources', 'openclaw')

const macArchitectures = ['x64', 'arm64']
const windowsArchitectures = ['x64', 'arm64', 'ia32']

function resolveCommand(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status ?? 1}`)
  }
}

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore' })
  return !result.error && result.status === 0
}

function getDesktopPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
}

function getDesktopVersion() {
  return String(getDesktopPackageJson().version || '0.1.0')
}

function readCliOption(argv, name) {
  const prefix = `${name}=`
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === name) {
      return argv[index + 1]
    }
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length)
    }
  }
  return undefined
}

function hasCliFlag(argv, name) {
  return argv.includes(name)
}

function normalizePlatformName(value) {
  if (!value) {
    return undefined
  }

  const nextValue = String(value).trim().toLowerCase()
  if (nextValue === 'mac' || nextValue === 'darwin' || nextValue === 'macos' || nextValue === 'osx') {
    return 'darwin'
  }
  if (nextValue === 'win' || nextValue === 'win32' || nextValue === 'windows') {
    return 'win32'
  }
  if (nextValue === 'linux') {
    return 'linux'
  }
  return undefined
}

function normalizeArchName(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const archMap = {
    0: 'ia32',
    1: 'x64',
    2: 'armv7l',
    3: 'arm64',
    4: 'universal',
  }

  if (typeof value === 'number' && value in archMap) {
    return archMap[value]
  }

  const nextValue = String(value).trim().toLowerCase()
  if (nextValue === 'amd64' || nextValue === 'x64') {
    return 'x64'
  }
  if (nextValue === 'arm64' || nextValue === 'aarch64') {
    return 'arm64'
  }
  if (nextValue === 'ia32' || nextValue === 'x86' || nextValue === 'intel') {
    return 'ia32'
  }
  if (nextValue === 'universal') {
    return 'universal'
  }
  return undefined
}

function assertSupportedRuntimeTarget(platform, arch) {
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
    return
  }
  if (platform === 'win32' && (arch === 'x64' || arch === 'arm64' || arch === 'ia32')) {
    return
  }
  if (platform === 'linux' && (arch === 'x64' || arch === 'arm64')) {
    return
  }

  throw new Error(`Unsupported target runtime: platform=${platform ?? 'unknown'} arch=${arch ?? 'unknown'}`)
}

function toElectronBuilderPlatformFlag(platform) {
  if (platform === 'darwin') {
    return '--mac'
  }
  if (platform === 'win32') {
    return '--win'
  }
  if (platform === 'linux') {
    return '--linux'
  }
  throw new Error(`Unsupported electron-builder platform: ${platform}`)
}

module.exports = {
  bundledRuntimeRoot,
  commandExists,
  defaultOpenClawSourceRoot,
  getDesktopPackageJson,
  getDesktopVersion,
  hasCliFlag,
  macArchitectures,
  normalizeArchName,
  normalizePlatformName,
  projectRoot,
  readCliOption,
  resolveCommand,
  run,
  toElectronBuilderPlatformFlag,
  windowsArchitectures,
  assertSupportedRuntimeTarget,
}
