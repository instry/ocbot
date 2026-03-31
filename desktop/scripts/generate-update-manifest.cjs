const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { getDesktopVersion, getDesktopVersionConfig, projectRoot } = require('./common.cjs')

function normalizeNotes(notes) {
  if (Array.isArray(notes)) {
    return notes.map((entry) => String(entry).trim()).filter(Boolean)
  }
  if (typeof notes === 'string') {
    return notes
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return []
}

function base64Sha512(filePath) {
  const hash = crypto.createHash('sha512')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('base64')
}

function detectArch(fileName) {
  const match = fileName.match(/-(universal|arm64|x64|ia32)\.(dmg|exe)$/i)
  return match ? match[1].toLowerCase() : null
}

function detectPlatform(fileName) {
  if (fileName.endsWith('.dmg')) {
    return 'darwin'
  }
  if (fileName.endsWith('.exe')) {
    return 'win32'
  }
  return null
}

function buildReleaseUrl(versionConfig, version) {
  if (typeof versionConfig.releaseUrl === 'string' && versionConfig.releaseUrl.trim()) {
    return versionConfig.releaseUrl.trim()
  }

  const repository = process.env.OCBOT_GITHUB_REPOSITORY?.trim()
  if (!repository) {
    return undefined
  }

  const tag = typeof versionConfig.releaseTag === 'string' && versionConfig.releaseTag.trim()
    ? versionConfig.releaseTag.trim()
    : `v${version}`

  return `https://github.com/${repository}/releases/tag/${tag}`
}

function main() {
  const version = getDesktopVersion()
  const versionConfig = getDesktopVersionConfig()
  const outputDir = path.join(projectRoot, 'out')
  const baseUrl = (process.env.OCBOT_UPDATE_BASE_URL || 'https://cdn.oc.bot/releases').replace(/\/+$/, '')
  const cdnPath = typeof versionConfig.cdnPath === 'string' && versionConfig.cdnPath.trim()
    ? versionConfig.cdnPath.trim()
    : version

  if (!fs.existsSync(outputDir)) {
    console.log('[update-manifest] Skip: out directory does not exist yet')
    return
  }

  const assets = {}
  const files = fs.readdirSync(outputDir, { withFileTypes: true })
  for (const entry of files) {
    if (!entry.isFile()) {
      continue
    }

    const platform = detectPlatform(entry.name)
    if (!platform || !entry.name.includes(version)) {
      continue
    }

    const arch = detectArch(entry.name)
    if (!arch) {
      continue
    }

    const filePath = path.join(outputDir, entry.name)
    const stat = fs.statSync(filePath)
    assets[platform] = assets[platform] || {}
    assets[platform][arch] = {
      fileName: entry.name,
      size: stat.size,
      sha512: base64Sha512(filePath),
      url: `${baseUrl}/${encodeURIComponent(cdnPath)}/${encodeURIComponent(entry.name)}`,
    }
  }

  const assetCount = Object.values(assets).reduce(
    (count, platformAssets) => count + Object.keys(platformAssets).length,
    0,
  )

  if (assetCount === 0) {
    console.log(`[update-manifest] Skip: no installer artifacts found for ${version}`)
    return
  }

  const manifest = {
    schemaVersion: 1,
    product: 'ocbot-desktop',
    version,
    publishedAt: typeof versionConfig.publishedAt === 'string'
      ? versionConfig.publishedAt
      : typeof versionConfig.date === 'string'
        ? versionConfig.date
        : '',
    channel: typeof versionConfig.channel === 'string' && versionConfig.channel.trim()
      ? versionConfig.channel.trim()
      : 'stable',
    releaseTag: typeof versionConfig.releaseTag === 'string' && versionConfig.releaseTag.trim()
      ? versionConfig.releaseTag.trim()
      : `v${version}`,
    notes: normalizeNotes(versionConfig.notes),
    releaseUrl: buildReleaseUrl(versionConfig, version),
    runtime: {
      openclaw: versionConfig.openclaw,
    },
    assets,
  }

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  const latestPath = path.join(outputDir, 'latest.json')
  const versionPath = path.join(outputDir, `${version}.json`)

  fs.writeFileSync(latestPath, manifestText, 'utf8')
  fs.writeFileSync(versionPath, manifestText, 'utf8')

  console.log(`[update-manifest] Wrote ${path.relative(projectRoot, latestPath)}`)
  console.log(`[update-manifest] Wrote ${path.relative(projectRoot, versionPath)}`)
}

main()
