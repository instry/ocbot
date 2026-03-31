const crypto = require('node:crypto')
const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  getDesktopVersion,
  getDesktopVersionConfig,
  hasCliFlag,
  projectRoot,
  readCliOption,
  resolveCommand,
  syncPackageVersionFiles,
} = require('./common.cjs')

const argv = process.argv.slice(2)

const defaultRepository = 'instry/ocbot'
const defaultBucket = 'ocbot'
const defaultCdnBaseUrl = 'https://cdn.oc.bot'

function printHelp() {
  console.log(`Usage:
  node scripts/release.cjs [options]

Options:
  --artifact <path>
  --repo <owner/name>
  --tag <tag>
  --skip-github
  --skip-r2
  --dry-run
  --help
`)
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return false
  }

  const content = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if (!key || value === '') {
      continue
    }

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1)
    }

    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value
    }
  }

  return true
}

function loadReleaseEnvironment() {
  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, 'scripts', '.env'),
    path.resolve(projectRoot, '..', 'browser', 'scripts', '.env'),
  ]

  for (const candidate of candidates) {
    loadEnvFile(candidate)
  }
}

function runAndRead(command, args, options = {}) {
  const result = spawnSync(command, args, {
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

function ensureCommandAvailable(name) {
  const command = resolveCommand(name)
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
  if (result.error || result.status !== 0) {
    throw new Error(`${name} is required for desktop release`)
  }
}

function ensureGhAuth() {
  const command = resolveCommand('gh')
  const result = spawnSync(command, ['auth', 'status'], { stdio: 'ignore' })
  if (result.error || result.status !== 0) {
    throw new Error('GitHub CLI is not authenticated. Run gh auth login first.')
  }
}

function getReleaseNotes(versionConfig) {
  if (!Array.isArray(versionConfig.notes)) {
    return `Ocbot v${getDesktopVersion()}`
  }

  const lines = versionConfig.notes
    .map((entry) => String(entry).trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return `Ocbot v${getDesktopVersion()}`
  }

  return lines.map((entry) => `- ${entry}`).join('\n')
}

function parseRepositoryFromGitRemote(remoteUrl) {
  if (!remoteUrl) {
    return undefined
  }

  const sshMatch = remoteUrl.match(/github\.com:([^/]+\/[^/.]+)(?:\.git)?$/i)
  if (sshMatch) {
    return sshMatch[1]
  }

  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/i)
  if (httpsMatch) {
    return httpsMatch[1]
  }

  return undefined
}

function resolveRepository(versionConfig, override) {
  if (override) {
    return override.trim()
  }

  const envRepository = process.env.OCBOT_GITHUB_REPOSITORY?.trim()
  if (envRepository) {
    return envRepository
  }

  if (typeof versionConfig.githubRepository === 'string' && versionConfig.githubRepository.trim()) {
    return versionConfig.githubRepository.trim()
  }

  try {
    const remoteUrl = runAndRead(resolveCommand('git'), ['-C', projectRoot, 'remote', 'get-url', 'origin'])
    const remoteRepository = parseRepositoryFromGitRemote(remoteUrl)
    if (remoteRepository) {
      return remoteRepository
    }
  } catch (error) {
    console.warn(`[release] Could not resolve git remote repository: ${error.message}`)
  }

  return defaultRepository
}

function unique(values) {
  return [...new Set(values)]
}

function collectArtifacts(version, overrides = []) {
  const outDir = path.join(projectRoot, 'out')
  const normalizedOverrides = unique(overrides.filter(Boolean))

  if (normalizedOverrides.length > 0) {
    return normalizedOverrides.map((entry) => {
      const artifactPath = path.isAbsolute(entry) ? entry : path.resolve(projectRoot, entry)
      if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
        throw new Error(`Artifact not found: ${artifactPath}`)
      }
      return artifactPath
    })
  }

  if (!fs.existsSync(outDir)) {
    throw new Error(`Output directory not found: ${outDir}`)
  }

  const candidates = fs.readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => fileName.includes(version))
    .filter((fileName) => fileName.endsWith('.dmg') || fileName.endsWith('.exe'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => path.join(outDir, fileName))

  if (candidates.length === 0) {
    throw new Error(`No desktop installer artifacts found in ${outDir} for version ${version}`)
  }

  return candidates
}

function getManifestPaths(version) {
  return {
    latestPath: path.join(projectRoot, 'out', 'latest.json'),
    versionPath: path.join(projectRoot, 'out', `${version}.json`),
  }
}

function ensureReleaseManifests(version) {
  const { latestPath, versionPath } = getManifestPaths(version)
  if (!fs.existsSync(latestPath)) {
    throw new Error(`Update manifest not found: ${latestPath}`)
  }
  if (!fs.existsSync(versionPath)) {
    throw new Error(`Version manifest not found: ${versionPath}`)
  }
  return { latestPath, versionPath }
}

function generateUpdateManifest(repository) {
  const env = {
    ...process.env,
    OCBOT_GITHUB_REPOSITORY: repository,
  }

  const result = spawnSync(resolveCommand('node'), ['scripts/generate-update-manifest.cjs'], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`node scripts/generate-update-manifest.cjs exited with code ${result.status ?? 1}`)
  }
}

function createOrUpdateGitHubRelease({
  artifacts,
  notes,
  repository,
  tag,
  title,
  dryRun,
}) {
  const gh = resolveCommand('gh')
  const assetNames = artifacts.map((artifactPath) => path.basename(artifactPath)).join(', ')
  console.log(`[release] GitHub repository ${repository}`)
  console.log(`[release] GitHub tag ${tag}`)
  console.log(`[release] GitHub assets ${assetNames}`)

  if (dryRun) {
    console.log('[release] Dry run: skipping GitHub release upload')
    return
  }

  ensureCommandAvailable('gh')
  ensureGhAuth()

  const releaseExists = spawnSync(gh, ['release', 'view', tag, '--repo', repository], {
    stdio: 'ignore',
  }).status === 0

  if (releaseExists) {
    const uploadArgs = ['release', 'upload', tag, ...artifacts, '--clobber', '--repo', repository]
    const uploadResult = spawnSync(gh, uploadArgs, { cwd: projectRoot, stdio: 'inherit' })
    if (uploadResult.error) {
      throw uploadResult.error
    }
    if (uploadResult.status !== 0) {
      throw new Error(`gh ${uploadArgs.join(' ')} exited with code ${uploadResult.status ?? 1}`)
    }
    return
  }

  const createArgs = ['release', 'create', tag, ...artifacts, '--repo', repository, '--title', title, '--notes', notes]
  const createResult = spawnSync(gh, createArgs, { cwd: projectRoot, stdio: 'inherit' })
  if (createResult.error) {
    throw createResult.error
  }
  if (createResult.status !== 0) {
    throw new Error(`gh ${createArgs.join(' ')} exited with code ${createResult.status ?? 1}`)
  }
}

function encodeS3Path(key) {
  return `/${defaultBucket}/${key.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function createSigningKey(secretAccessKey, shortDate, region, service) {
  const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(shortDate).digest()
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest()
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest()
  return crypto.createHmac('sha256', kService).update('aws4_request').digest()
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function requestWithBody({
  accountId,
  accessKeyId,
  secretAccessKey,
  bodyStreamFactory,
  bodyLength,
  contentType,
  cacheControl,
  key,
  method,
  payloadHash,
}) {
  return new Promise((resolve, reject) => {
    const host = `${accountId}.r2.cloudflarestorage.com`
    const now = new Date()
    const amzDate = toAmzDate(now)
    const shortDate = amzDate.slice(0, 8)
    const region = 'auto'
    const service = 's3'
    const canonicalUri = encodeS3Path(key)

    const headers = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    }

    if (typeof bodyLength === 'number') {
      headers['content-length'] = String(bodyLength)
    }
    if (contentType) {
      headers['content-type'] = contentType
    }
    if (cacheControl) {
      headers['cache-control'] = cacheControl
    }

    const sortedHeaderNames = Object.keys(headers).sort()
    const canonicalHeaders = sortedHeaderNames
      .map((name) => `${name}:${String(headers[name]).trim()}\n`)
      .join('')
    const signedHeaders = sortedHeaderNames.join(';')
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n')

    const credentialScope = `${shortDate}/${region}/${service}/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n')

    const signature = crypto
      .createHmac('sha256', createSigningKey(secretAccessKey, shortDate, region, service))
      .update(stringToSign)
      .digest('hex')

    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    const request = https.request({
      method,
      host,
      path: canonicalUri,
      headers,
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`R2 ${method} ${key} failed with status ${response.statusCode ?? 500}: ${responseBody || 'no response body'}`))
          return
        }
        resolve({
          statusCode: response.statusCode ?? 200,
          body: responseBody,
        })
      })
    })

    request.on('error', reject)

    if (!bodyStreamFactory) {
      request.end()
      return
    }

    const stream = bodyStreamFactory()
    stream.on('error', reject)
    stream.pipe(request)
  })
}

function sha256FileHex(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function mimeTypeForArtifact(filePath) {
  if (filePath.endsWith('.dmg')) {
    return 'application/x-apple-diskimage'
  }
  if (filePath.endsWith('.exe')) {
    return 'application/x-msdownload'
  }
  if (filePath.endsWith('.json')) {
    return 'application/json'
  }
  return 'application/octet-stream'
}

async function uploadFileToR2({ accountId, accessKeyId, secretAccessKey, filePath, key, cacheControl }) {
  const stat = fs.statSync(filePath)
  const payloadHash = await sha256FileHex(filePath)
  await requestWithBody({
    accountId,
    accessKeyId,
    secretAccessKey,
    bodyLength: stat.size,
    bodyStreamFactory: () => fs.createReadStream(filePath),
    cacheControl,
    contentType: mimeTypeForArtifact(filePath),
    key,
    method: 'PUT',
    payloadHash,
  })
}

async function uploadJsonToR2({ accountId, accessKeyId, secretAccessKey, filePath, key, cacheControl }) {
  const body = fs.readFileSync(filePath)
  await requestWithBody({
    accountId,
    accessKeyId,
    secretAccessKey,
    bodyLength: body.length,
    bodyStreamFactory: () => fs.createReadStream(filePath),
    cacheControl,
    contentType: 'application/json',
    key,
    method: 'PUT',
    payloadHash: sha256Hex(body),
  })
}

async function uploadToR2({ artifacts, dryRun, latestPath, version, versionConfig, versionPath }) {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const cdnPath = typeof versionConfig.cdnPath === 'string' && versionConfig.cdnPath.trim()
    ? versionConfig.cdnPath.trim()
    : version

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.')
  }

  const cdnBaseUrl = (process.env.OCBOT_UPDATE_BASE_URL || `${defaultCdnBaseUrl}/releases`).replace(/\/+$/, '')
  console.log(`[release] Cloudflare base ${cdnBaseUrl}`)

  const uploads = [
    ...artifacts.map((artifactPath) => ({
      filePath: artifactPath,
      key: `releases/${cdnPath}/${path.basename(artifactPath)}`,
      cacheControl: 'public, max-age=31536000, immutable',
    })),
    {
      filePath: latestPath,
      key: 'releases/latest.json',
      cacheControl: 'public, max-age=60',
    },
    {
      filePath: versionPath,
      key: `releases/${version}.json`,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  ]

  for (const upload of uploads) {
    console.log(`[release] Cloudflare upload ${upload.key}`)
    if (dryRun) {
      continue
    }

    if (upload.filePath.endsWith('.json')) {
      await uploadJsonToR2({
        accountId,
        accessKeyId,
        cacheControl: upload.cacheControl,
        filePath: upload.filePath,
        key: upload.key,
        secretAccessKey,
      })
      continue
    }

    await uploadFileToR2({
      accountId,
      accessKeyId,
      cacheControl: upload.cacheControl,
      filePath: upload.filePath,
      key: upload.key,
      secretAccessKey,
    })
  }
}

async function main() {
  if (hasCliFlag(argv, '--help')) {
    printHelp()
    return
  }

  loadReleaseEnvironment()
  syncPackageVersionFiles()

  const version = getDesktopVersion()
  const versionConfig = getDesktopVersionConfig()
  const repository = resolveRepository(versionConfig, readCliOption(argv, '--repo'))
  const tag = readCliOption(argv, '--tag')
    || (typeof versionConfig.releaseTag === 'string' && versionConfig.releaseTag.trim() ? versionConfig.releaseTag.trim() : `v${version}`)
  const artifactOption = readCliOption(argv, '--artifact')
  const artifacts = collectArtifacts(version, artifactOption ? artifactOption.split(',').map((entry) => entry.trim()) : [])
  const notes = getReleaseNotes(versionConfig)
  const title = `Ocbot v${version}`
  const dryRun = hasCliFlag(argv, '--dry-run')
  const skipGitHub = hasCliFlag(argv, '--skip-github')
  const skipR2 = hasCliFlag(argv, '--skip-r2')

  console.log(`[release] Desktop version ${version}`)
  console.log(`[release] Release tag ${tag}`)
  console.log(`[release] Repository ${repository}`)
  console.log(`[release] Dry run ${dryRun ? 'enabled' : 'disabled'}`)

  generateUpdateManifest(repository)
  const { latestPath, versionPath } = ensureReleaseManifests(version)

  if (!skipGitHub) {
    createOrUpdateGitHubRelease({
      artifacts,
      dryRun,
      notes,
      repository,
      tag,
      title,
    })
  } else {
    console.log('[release] Skipping GitHub release upload')
  }

  if (skipR2) {
    console.log('[release] Skipping Cloudflare upload')
  } else {
    await uploadToR2({
      artifacts,
      dryRun,
      latestPath,
      version,
      versionConfig,
      versionPath,
    })
  }

  console.log(`[release] Completed desktop release for ${tag}`)
}

main().catch((error) => {
  console.error(`[release] Failed: ${error.message}`)
  process.exitCode = 1
})
