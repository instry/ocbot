/**
 * Dev mode entry point.
 * Starts OpenClaw gateway from sibling directory, then launches Electron.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const GATEWAY_PORT = 18789

async function waitForGateway(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2_000),
      })
      if (res.ok) return
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Gateway did not start within ${timeoutMs}ms`)
}

async function main() {
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
  const openclawDir = join(repoRoot, 'openclaw')

  if (!existsSync(join(openclawDir, 'openclaw.mjs'))) {
    console.error(`OpenClaw not found at ${openclawDir}`)
    console.error('Make sure ../openclaw/ exists relative to the ocbot repo root.')
    process.exit(1)
  }

  // Check if gateway is already running
  let gatewayProcess: ChildProcess | null = null
  let externalGateway = false

  try {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/health`, {
      signal: AbortSignal.timeout(2_000),
    })
    if (res.ok) {
      console.log(`[dev] Gateway already running on port ${GATEWAY_PORT}`)
      externalGateway = true
    }
  } catch {
    // Not running, we'll start it
  }

  if (!externalGateway) {
    console.log(`[dev] Starting OpenClaw gateway from ${openclawDir}...`)

    const configDir = join(repoRoot, 'ocbot', '.openclaw')
    gatewayProcess = spawn('node', [
      'openclaw.mjs', 'gateway', 'run',
      '--port', String(GATEWAY_PORT),
      '--bind', 'loopback',
      '--force',
    ], {
      cwd: openclawDir,
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: join(configDir, 'openclaw.json'),
        OPENCLAW_STATE_DIR: configDir,
        OPENCLAW_BUNDLED_PLUGINS_DIR: join(openclawDir, 'extensions'),
        OPENCLAW_NO_RESPAWN: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    gatewayProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(`[gateway] ${d}`))
    gatewayProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(`[gateway] ${d}`))

    gatewayProcess.on('exit', (code) => {
      console.log(`[dev] Gateway exited (code ${code})`)
    })

    await waitForGateway(GATEWAY_PORT)
    console.log('[dev] Gateway is ready')
  }

  // Launch Electron
  console.log('[dev] Starting Electron...')
  const electronBin = resolve(import.meta.dirname, '..', '..', 'node_modules', '.bin', 'electron')
  const electronMain = resolve(import.meta.dirname, 'index.ts')

  const electron = spawn(electronBin, [
    '--inspect',
    electronMain,
  ], {
    cwd: resolve(import.meta.dirname, '..', '..'),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_RUN_AS_NODE: undefined,
    },
    stdio: 'inherit',
  })

  electron.on('exit', (code) => {
    console.log(`[dev] Electron exited (code ${code})`)
    gatewayProcess?.kill()
    process.exit(code ?? 0)
  })

  // Cleanup on ctrl+c
  process.on('SIGINT', () => {
    electron.kill()
    gatewayProcess?.kill()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
