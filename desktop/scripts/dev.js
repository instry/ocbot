#!/usr/bin/env node
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
function resolveCmd(cmd) {
  if (process.platform === 'win32') {
    if (cmd === 'npm') return 'npm.cmd'
  }
  return cmd
}
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    let p
    try {
      p = spawn(resolveCmd(cmd), args, { stdio: 'inherit', shell: false, cwd: root, ...opts })
    } catch (e) {
      p = spawn(resolveCmd(cmd), args, { stdio: 'inherit', shell: true, cwd: root, ...opts })
    }
    p.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
  })
}
function exists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}
function rmrf(rel) {
  const p = path.join(root, rel)
  if (exists(p)) {
    fs.rmSync(p, { recursive: true, force: true })
  }
}
function readPkg() {
  if (!exists(pkgPath)) return null
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
}
function help() {
  console.log('Usage: node scripts/dev.js <command> [options]')
  console.log('Commands:')
  console.log('  check                      Verify environment and project setup')
  console.log('  build [--main] [--renderer] Build main/preload and/or renderer')
  console.log('  run [--build]              Launch Electron app, optionally build first')
  console.log('  pack                       Build and create unpacked dir with electron-builder')
  console.log('  dist                       Build and create installer with electron-builder')
  console.log('  update-web                 Build renderer only')
  console.log('  clean                      Remove dist and out directories')
}
async function cmdCheck() {
  const nodeVer = process.version
  const npmVer = await new Promise(resolve => {
    let p
    try {
      p = spawn(resolveCmd('npm'), ['-v'], { shell: false })
    } catch {
      p = spawn(resolveCmd('npm'), ['-v'], { shell: true })
    }
    let out = ''
    p.stdout.on('data', d => (out += d.toString()))
    p.on('close', () => resolve(out.trim() || 'unknown'))
  })
  const pkg = readPkg()
  const hasElectron = pkg && ((pkg.devDependencies && pkg.devDependencies.electron) || (pkg.dependencies && pkg.dependencies.electron))
  const hasEB = pkg && ((pkg.devDependencies && pkg.devDependencies['electron-builder']) || (pkg.dependencies && pkg.dependencies['electron-builder']))
  const hasVite = pkg && ((pkg.devDependencies && pkg.devDependencies.vite) || (pkg.dependencies && pkg.dependencies.vite))
  const hasTS = pkg && ((pkg.devDependencies && pkg.devDependencies.typescript) || (pkg.dependencies && pkg.dependencies.typescript))
  const nodeModules = exists(path.join(root, 'node_modules'))
  console.log(`node: ${nodeVer}`)
  console.log(`npm: ${npmVer}`)
  console.log(`node_modules: ${nodeModules ? 'present' : 'missing'}`)
  console.log(`electron: ${hasElectron ? 'declared' : 'missing'}`)
  console.log(`electron-builder: ${hasEB ? 'declared' : 'missing'}`)
  console.log(`vite: ${hasVite ? 'declared' : 'missing'}`)
  console.log(`typescript: ${hasTS ? 'declared' : 'missing'}`)
  if (!nodeModules) {
    console.log('Run: npm install')
  }
}
async function cmdBuild(flags) {
  const doMain = flags.main || (!flags.main && !flags.renderer)
  const doRenderer = flags.renderer || (!flags.main && !flags.renderer)
  if (doMain) await run('npm', ['run', 'build:main'])
  if (doRenderer) await run('npm', ['run', 'build:renderer'])
}
async function cmdRun(flags) {
  if (flags.build) await cmdBuild({})
  await run('npm', ['start'])
}
async function cmdPack() {
  await run('npm', ['run', 'pack'])
}
async function cmdDist() {
  await run('npm', ['run', 'dist'])
}
async function cmdUpdateWeb() {
  await run('npm', ['run', 'build:renderer'])
}
async function cmdClean() {
  rmrf('dist')
  rmrf('out')
}
function parseFlags(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--main') flags.main = true
    else if (a === '--renderer') flags.renderer = true
    else if (a === '--build') flags.build = true
  }
  return flags
}
async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0]
  const flags = parseFlags(argv.slice(1))
  try {
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return help()
    if (cmd === 'check') return await cmdCheck()
    if (cmd === 'build') return await cmdBuild(flags)
    if (cmd === 'run') return await cmdRun(flags)
    if (cmd === 'pack') return await cmdPack()
    if (cmd === 'dist') return await cmdDist()
    if (cmd === 'update-web') return await cmdUpdateWeb()
    if (cmd === 'clean') return await cmdClean()
    console.error('Unknown command:', cmd)
    process.exit(1)
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }
}
main()
