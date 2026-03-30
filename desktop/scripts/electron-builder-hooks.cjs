const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  assertSupportedRuntimeTarget,
  bundledRuntimeRoot,
  commandExists,
  getConfiguredOpenClawCommit,
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

function runAndRead(command, args, options = {}) {
  const result = require('node:child_process').spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : ''
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status ?? 1}${stderr ? `: ${stderr}` : ''}`)
  }

  return typeof result.stdout === 'string' ? result.stdout.trim() : ''
}

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

function readOpenClawGitHead(sourceRoot) {
  return runAndRead(resolveCommand('git'), ['-C', sourceRoot, 'rev-parse', 'HEAD'])
}

function readOpenClawGitStatus(sourceRoot) {
  return runAndRead(resolveCommand('git'), ['-C', sourceRoot, 'status', '--short', '--untracked-files=all'])
}

function ensureConfiguredOpenClawCommit(sourceRoot) {
  const desktopVersion = getDesktopVersion()
  const expectedCommit = getConfiguredOpenClawCommit()
  const actualCommit = readOpenClawGitHead(sourceRoot)

  if (actualCommit !== expectedCommit) {
    throw new Error(
      `OpenClaw commit mismatch for desktop ${desktopVersion}: expected ${expectedCommit}, found ${actualCommit} in ${sourceRoot}`,
    )
  }
}

function ensureOpenClawGitClean(sourceRoot) {
  if (process.env.OCBOT_ALLOW_DIRTY_OPENCLAW === '1') {
    console.log('[OpenClaw bundle] Allowing dirty OpenClaw source tree for local bundled runtime preparation')
    return
  }

  const statusOutput = readOpenClawGitStatus(sourceRoot)
  if (!statusOutput) {
    return
  }

  const preview = statusOutput
    .split('\n')
    .slice(0, 10)
    .join('\n')

  throw new Error(
    `OpenClaw source tree has uncommitted changes in ${sourceRoot}. Commit or discard them before packaging.\n${preview}`,
  )
}

function ensureOpenClawBuild(sourceRoot) {
  syncPackageVersionFiles()
  assertPathExists(sourceRoot, 'OpenClaw source directory')
  assertPathExists(path.join(sourceRoot, 'package.json'), 'OpenClaw package.json')
  assertPathExists(path.join(sourceRoot, 'openclaw.mjs'), 'OpenClaw bootstrap entry')
  ensureConfiguredOpenClawVersion(sourceRoot)
  ensureConfiguredOpenClawCommit(sourceRoot)
  ensureOpenClawGitClean(sourceRoot)

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

function prepareBundledExternalPlugin({
  tempRoot,
  outputRoot,
  runtimeTarget,
  pluginId,
  npmSpec,
}) {
  const packDir = path.join(tempRoot, `pack-${pluginId}`)
  const extractDir = path.join(tempRoot, `extract-${pluginId}`)
  fs.mkdirSync(packDir, { recursive: true })
  fs.mkdirSync(extractDir, { recursive: true })

  console.log(`[OpenClaw bundle] Packing ${npmSpec}`)
  run(resolveCommand('npm'), ['pack', npmSpec, '--pack-destination', packDir])

  const tarballName = fs.readdirSync(packDir).find((entry) => entry.endsWith('.tgz'))
  if (!tarballName) {
    throw new Error(`No tarball produced for ${npmSpec} in ${packDir}`)
  }

  const tarballPath = path.join(packDir, tarballName)
  run('tar', ['-xzf', tarballPath, '-C', extractDir])

  const packageRoot = path.join(extractDir, 'package')
  assertPathExists(packageRoot, `${pluginId} package`)

  const targetDir = path.join(outputRoot, 'extensions', pluginId)
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(packageRoot, targetDir, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !sourcePath.includes(`${path.sep}node_modules${path.sep}`) && !sourcePath.endsWith(`${path.sep}node_modules`),
  })

  assertPathExists(path.join(targetDir, 'package.json'), `${pluginId} package.json`)
  assertPathExists(path.join(targetDir, 'openclaw.plugin.json'), `${pluginId} manifest`)
  assertPathExists(path.join(targetDir, 'index.ts'), `${pluginId} entry`)

  const packageJsonPath = path.join(targetDir, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  if (packageJson.devDependencies) {
    for (const [dependencyName, dependencyVersion] of Object.entries(packageJson.devDependencies)) {
      if (typeof dependencyVersion === 'string' && dependencyVersion.startsWith('workspace:')) {
        delete packageJson.devDependencies[dependencyName]
      }
    }
    if (Object.keys(packageJson.devDependencies).length === 0) {
      delete packageJson.devDependencies
    }
  }
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

  console.log(`[OpenClaw bundle] Installing production dependencies for ${pluginId}`)
  run(resolveCommand('npm'), ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: targetDir,
    env: {
      ...process.env,
      npm_config_platform: runtimeTarget.platform,
      npm_config_arch: runtimeTarget.arch,
      npm_config_loglevel: process.env.npm_config_loglevel || 'warn',
    },
  })

  fs.rmSync(path.join(targetDir, 'node_modules', '.bin'), { recursive: true, force: true })

  const pluginNodeModulesDir = path.join(targetDir, 'node_modules')
  const bundledHostPackageDir = path.join(pluginNodeModulesDir, 'openclaw')
  fs.mkdirSync(pluginNodeModulesDir, { recursive: true })
  fs.rmSync(bundledHostPackageDir, { recursive: true, force: true })
  fs.mkdirSync(bundledHostPackageDir, { recursive: true })
  fs.cpSync(path.join(outputRoot, 'package.json'), path.join(bundledHostPackageDir, 'package.json'))
  fs.cpSync(path.join(outputRoot, 'openclaw.mjs'), path.join(bundledHostPackageDir, 'openclaw.mjs'))
  fs.cpSync(path.join(outputRoot, 'dist'), path.join(bundledHostPackageDir, 'dist'), {
    recursive: true,
    force: true,
  })
}

function prepareBundledLocalPlugin({
  sourceRoot,
  outputRoot,
  runtimeTarget,
  pluginId,
  localPath,
}) {
  const packageRoot = path.join(sourceRoot, localPath)
  assertPathExists(packageRoot, `${pluginId} package`)

  const targetDir = path.join(outputRoot, 'extensions', pluginId)
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(packageRoot, targetDir, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !sourcePath.includes(`${path.sep}node_modules${path.sep}`) && !sourcePath.endsWith(`${path.sep}node_modules`),
  })

  assertPathExists(path.join(targetDir, 'package.json'), `${pluginId} package.json`)
  assertPathExists(path.join(targetDir, 'openclaw.plugin.json'), `${pluginId} manifest`)
  assertPathExists(path.join(targetDir, 'index.ts'), `${pluginId} entry`)

  const packageJsonPath = path.join(targetDir, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  if (packageJson.devDependencies) {
    for (const [dependencyName, dependencyVersion] of Object.entries(packageJson.devDependencies)) {
      if (typeof dependencyVersion === 'string' && dependencyVersion.startsWith('workspace:')) {
        delete packageJson.devDependencies[dependencyName]
      }
    }
    if (Object.keys(packageJson.devDependencies).length === 0) {
      delete packageJson.devDependencies
    }
  }
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

  console.log(`[OpenClaw bundle] Installing production dependencies for ${pluginId}`)
  run(resolveCommand('npm'), ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: targetDir,
    env: {
      ...process.env,
      npm_config_platform: runtimeTarget.platform,
      npm_config_arch: runtimeTarget.arch,
      npm_config_loglevel: process.env.npm_config_loglevel || 'warn',
    },
  })

  fs.rmSync(path.join(targetDir, 'node_modules', '.bin'), { recursive: true, force: true })

  const pluginNodeModulesDir = path.join(targetDir, 'node_modules')
  const bundledHostPackageDir = path.join(pluginNodeModulesDir, 'openclaw')
  fs.mkdirSync(pluginNodeModulesDir, { recursive: true })
  fs.rmSync(bundledHostPackageDir, { recursive: true, force: true })
  fs.mkdirSync(bundledHostPackageDir, { recursive: true })
  fs.cpSync(path.join(outputRoot, 'package.json'), path.join(bundledHostPackageDir, 'package.json'))
  fs.cpSync(path.join(outputRoot, 'openclaw.mjs'), path.join(bundledHostPackageDir, 'openclaw.mjs'))
  fs.cpSync(path.join(outputRoot, 'dist'), path.join(bundledHostPackageDir, 'dist'), {
    recursive: true,
    force: true,
  })
}

function patchFileIfNeeded(filePath, transform) {
  assertPathExists(filePath, filePath)
  const source = fs.readFileSync(filePath, 'utf8')
  const nextSource = transform(source)
  if (nextSource === source) {
    return false
  }
  fs.writeFileSync(filePath, nextSource, 'utf8')
  return true
}

function patchOptionalFile(filePath, transform) {
  if (!fs.existsSync(filePath)) {
    return false
  }
  return patchFileIfNeeded(filePath, transform)
}

function patchBundledWeixinPlugin(outputRoot) {
  const changed = []
  const readyMarkerPath = path.join(outputRoot, '.ocbot-weixin-ready.json')

  const weixinChannelPath = path.join(outputRoot, 'extensions', 'openclaw-weixin', 'src', 'channel.ts')
  changed.push(patchFileIfNeeded(weixinChannelPath, (source) => {
    if (source.includes('gatewayMethods')) {
      return source
    }

    const marker = 'configSchema: {'
    const index = source.indexOf(marker)
    if (index === -1) {
      throw new Error(`Unable to inject gatewayMethods into ${weixinChannelPath}`)
    }

    return source.slice(0, index)
      + 'gatewayMethods: ["web.login.start", "web.login.wait"],\n  '
      + source.slice(index)
  }))

  const webMethodsPath = path.join(outputRoot, 'src', 'gateway', 'server-methods', 'web.ts')
  changed.push(patchOptionalFile(webMethodsPath, (source) => {
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
        throw new Error(`Unable to patch provider selection in ${webMethodsPath}`)
      }
      nextSource = nextSource.replace(currentBlock, nextBlock)
    }

    return nextSource.replace(
      'const provider = resolveWebLoginProvider();',
      'const provider = resolveWebLoginProvider(params);',
    )
  }))

  const schemaPath = path.join(outputRoot, 'src', 'gateway', 'protocol', 'schema', 'channels.ts')
  changed.push(patchOptionalFile(schemaPath, (source) => {
    if (source.includes('channel: Type.Optional(Type.String())')) {
      return source
    }

    return source
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
  }))

  fs.writeFileSync(readyMarkerPath, `${JSON.stringify({
    pluginId: 'openclaw-weixin',
    preparedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8')

  if (changed.some(Boolean)) {
    console.log('[OpenClaw bundle] Patched bundled Weixin plugin/runtime for channel-specific QR login')
  }
}

function writeBundledRuntimeMarker(sourceRoot, outputRoot) {
  const marker = {
    desktopVersion: getDesktopVersion(),
    openclawVersion: getConfiguredOpenClawVersion(),
    openclawCommit: getConfiguredOpenClawCommit(),
    preparedAt: new Date().toISOString(),
    sourceRoot: path.resolve(sourceRoot),
  }

  fs.writeFileSync(
    path.join(outputRoot, '.ocbot-runtime-ready.json'),
    `${JSON.stringify(marker, null, 2)}\n`,
    'utf8',
  )
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

    prepareBundledExternalPlugin({
      tempRoot,
      outputRoot,
      runtimeTarget,
      pluginId: 'openclaw-weixin',
      npmSpec: '@tencent-weixin/openclaw-weixin',
    })
    prepareBundledLocalPlugin({
      sourceRoot,
      outputRoot,
      runtimeTarget,
      pluginId: 'feishu',
      localPath: path.join('extensions', 'feishu'),
    })
    patchBundledWeixinPlugin(outputRoot)
    writeBundledRuntimeMarker(sourceRoot, outputRoot)

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
module.exports.patchBundledWeixinPlugin = patchBundledWeixinPlugin
module.exports.prepareBundledExternalPlugin = prepareBundledExternalPlugin
module.exports.prepareBundledLocalPlugin = prepareBundledLocalPlugin
module.exports.prepareOpenClawRuntime = prepareOpenClawRuntime
module.exports.resolveOpenClawSourceRoot = resolveOpenClawSourceRoot
module.exports.resolveOutputRoot = resolveOutputRoot
module.exports.resolveRuntimeTarget = resolveRuntimeTarget
module.exports.writeBundledRuntimeMarker = writeBundledRuntimeMarker

if (require.main === module) {
  Promise.resolve(beforePack()).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
