import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

const CONVEX_BASE = 'https://wry-manatee-359.convex.site'
const MAX_ZIP_BYTES = 200 * 1024 * 1024

// ---------------------------------------------------------------------------
// Workspace resolution (mirrors RuntimeManager constructor logic)
// ---------------------------------------------------------------------------

function getWorkspaceDir(): string {
  const runtimeRoot = path.join(app.getPath('userData'), app.isPackaged ? 'openclaw' : 'openclaw-dev')
  return path.join(runtimeRoot, 'state', 'workspace')
}

function getSkillsDir(): string {
  return path.join(getWorkspaceDir(), 'skills')
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidSlug(slug: string): boolean {
  if (!slug) return false
  if (!/^[\x20-\x7E]+$/.test(slug)) return false  // ASCII printable only
  if (slug.includes('/') || slug.includes('\\')) return false
  if (slug.includes('..')) return false
  return true
}

// ---------------------------------------------------------------------------
// Lock file helpers
// ---------------------------------------------------------------------------

function getLockPath(): string {
  return path.join(getWorkspaceDir(), '.clawhub', 'lock.json')
}

function readLock(): Record<string, unknown> {
  const lockPath = getLockPath()
  try {
    const raw = fs.readFileSync(lockPath, 'utf8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeLock(lock: Record<string, unknown>): void {
  const lockPath = getLockPath()
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2), 'utf8')
}

function addToLock(slug: string, version: string): void {
  const lock = readLock()
  lock['version'] = 1
  const skills = (typeof lock['skills'] === 'object' && lock['skills'] !== null
    ? lock['skills']
    : {}) as Record<string, unknown>
  skills[slug] = { version: version || 'latest', installedAt: Date.now() }
  lock['skills'] = skills
  writeLock(lock)
}

function removeFromLock(slug: string): void {
  const lock = readLock()
  const skills = lock['skills']
  if (typeof skills === 'object' && skills !== null) {
    delete (skills as Record<string, unknown>)[slug]
  }
  writeLock(lock)
}

// ---------------------------------------------------------------------------
// Extraction + skill root detection
// ---------------------------------------------------------------------------

function extractZip(zipPath: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true })
  execSync(`unzip -q ${JSON.stringify(zipPath)} -d ${JSON.stringify(destDir)}`)
}

function findSkillRoot(extractDir: string): string | null {
  // SKILL.md at top level
  if (fs.existsSync(path.join(extractDir, 'SKILL.md'))) {
    return extractDir
  }
  // Single subdirectory containing SKILL.md
  const entries = fs.readdirSync(extractDir)
  const dirs = entries.filter((e) => {
    try {
      return fs.statSync(path.join(extractDir, e)).isDirectory()
    } catch {
      return false
    }
  })
  if (dirs.length === 1) {
    const sub = path.join(extractDir, dirs[0])
    if (fs.existsSync(path.join(sub, 'SKILL.md'))) {
      return sub
    }
  }
  return null
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    const stat = fs.statSync(srcPath)
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function installSkill(
  slug: string,
  version?: string,
): Promise<{ ok: boolean; message: string }> {
  console.log('[SkillInstaller] installSkill called:', slug, version)
  if (!isValidSlug(slug)) {
    return { ok: false, message: `Invalid slug: ${slug}` }
  }

  const ver = version ?? ''
  const url =
    `${CONVEX_BASE}/api/v1/download?slug=${encodeURIComponent(slug)}` +
    (ver ? `&version=${encodeURIComponent(ver)}` : '')

  console.log('[SkillInstaller] download URL:', url)
  console.log('[SkillInstaller] skills dir:', getSkillsDir())

  const tmpZip = path.join(os.tmpdir(), `skill-${slug}-${Date.now()}.zip`)
  const tmpExtract = path.join(os.tmpdir(), `skill-${slug}-${Date.now()}-extract`)

  try {
    // Download
    console.log('[SkillInstaller] fetching...')
    const res = await fetch(url)
    console.log('[SkillInstaller] fetch status:', res.status)
    if (!res.ok) {
      return { ok: false, message: `Download failed: HTTP ${res.status}` }
    }
    const contentLength = Number(res.headers.get('content-length') ?? 0)
    if (contentLength > MAX_ZIP_BYTES) {
      return { ok: false, message: `Archive too large (${contentLength} bytes)` }
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_ZIP_BYTES) {
      return { ok: false, message: `Archive too large (${buf.byteLength} bytes)` }
    }
    fs.writeFileSync(tmpZip, Buffer.from(buf))

    // Extract
    extractZip(tmpZip, tmpExtract)

    // Find skill root
    const skillRoot = findSkillRoot(tmpExtract)
    if (!skillRoot) {
      return { ok: false, message: 'SKILL.md not found in archive' }
    }

    // Install to target
    const targetDir = path.join(getSkillsDir(), slug)
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true })
    }
    copyDir(skillRoot, targetDir)

    if (!fs.existsSync(path.join(targetDir, 'SKILL.md'))) {
      fs.rmSync(targetDir, { recursive: true, force: true })
      return { ok: false, message: 'Installed layout invalid: missing SKILL.md' }
    }

    // Write .clawhub/origin.json
    const originDir = path.join(targetDir, '.clawhub')
    fs.mkdirSync(originDir, { recursive: true })
    fs.writeFileSync(
      path.join(originDir, 'origin.json'),
      JSON.stringify(
        {
          version: 1,
          registry: CONVEX_BASE,
          slug,
          installedVersion: ver || 'latest',
          installedAt: Date.now(),
        },
        null,
        2,
      ),
      'utf8',
    )

    // Update lock
    addToLock(slug, ver)

    return { ok: true, message: `Installed ${slug}` }
  } finally {
    try { fs.rmSync(tmpZip, { force: true }) } catch { /* ignore */ }
    try { fs.rmSync(tmpExtract, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

export async function uninstallSkill(
  slug: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isValidSlug(slug)) {
    return { ok: false, message: `Invalid slug: ${slug}` }
  }

  const targetDir = path.join(getSkillsDir(), slug)
  if (fs.existsSync(targetDir)) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true })
    } catch (err) {
      return { ok: false, message: `Failed to delete skill directory: ${err}` }
    }
  }

  removeFromLock(slug)
  return { ok: true, message: `Uninstalled ${slug}` }
}
