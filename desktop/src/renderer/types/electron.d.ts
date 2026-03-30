declare global {
  type OcbotChannelPlatform =
    | 'feishu'
    | 'telegram'
    | 'discord'
    | 'slack'
    | 'whatsapp'
    | 'dingtalk'
    | 'qq'
    | 'wecom'
    | 'weixin'

  type OcbotChannelPolicy = 'open' | 'disabled' | 'pairing' | 'allowlist'

  interface OcbotChannelConfig {
    enabled: boolean
    appId?: string
    appSecret?: string
    domain?: string
    botToken?: string
    clientId?: string
    clientSecret?: string
    botId?: string
    secret?: string
    accountId?: string
    dmPolicy: OcbotChannelPolicy
    groupPolicy: OcbotChannelPolicy
  }

  interface OcbotChannelPairingRequest {
    id: string
    code: string
    createdAt: string
    lastSeenAt: string
    meta?: Record<string, string>
  }

  interface OcbotBrowserProfileInfo {
    directory: string
    name: string
    path: string
  }

  interface OcbotBrowserProfilesResult {
    browser: {
      kind: string
      userDataDir: string
    }
    profiles: OcbotBrowserProfileInfo[]
  }

  interface OcbotAppUpdateAsset {
    url: string
    sha512?: string
    size?: number
    fileName?: string
  }

  interface OcbotAppUpdateInfo {
    currentVersion: string
    latestVersion: string
    publishedAt: string
    notes: string[]
    releaseUrl?: string
    manifestUrl: string
    download: OcbotAppUpdateAsset
  }

  interface OcbotAppUpdateDownloadProgress {
    received: number
    total: number | undefined
    percent: number | undefined
    speed: number | undefined
  }

  interface OcbotGatewayConnectionInfo {
    url: string
    token: string | null
  }

  interface OcbotStartupSettings {
    available: boolean
    openAtLogin: boolean
  }

  interface Window {
    ocbot?: {
      platform: string
      arch: string
      minimize: () => void
      maximize: () => void
      close: () => void
      installSkill: (slug: string, version?: string) => Promise<{ ok: boolean; message: string }>
      uninstallSkill: (slug: string) => Promise<{ ok: boolean; message: string }>
      getSystemLocale: () => Promise<string>
      getGatewayConnectionInfo: () => Promise<OcbotGatewayConnectionInfo>
      getBrowserProfiles: () => Promise<OcbotBrowserProfilesResult[]>
      getOcbotBrowserPath: () => Promise<string>
      startup: {
        getSettings: () => Promise<OcbotStartupSettings>
        setOpenAtLogin: (openAtLogin: boolean) => Promise<OcbotStartupSettings>
      }
      appUpdate: {
        check: () => Promise<OcbotAppUpdateInfo | null>
        download: (asset: OcbotAppUpdateAsset, version: string) => Promise<{ filePath: string }>
        cancelDownload: () => Promise<{ cancelled: boolean }>
        install: (filePath: string) => Promise<{ accepted: boolean }>
        onDownloadProgress: (
          handler: (progress: OcbotAppUpdateDownloadProgress) => void,
        ) => () => void
      }
      getChannelConfig: (platform: OcbotChannelPlatform) => Promise<OcbotChannelConfig>
      supportsChannelQrLogin: (platform: OcbotChannelPlatform) => Promise<boolean>
      startFeishuInstallQrcode: (isLark: boolean) => Promise<{
        url: string
        deviceCode: string
        interval: number
        expireIn: number
      }>
      pollFeishuInstall: (deviceCode: string) => Promise<{
        done: boolean
        appId?: string
        appSecret?: string
        domain?: string
        error?: string
      }>
      verifyFeishuCredentials: (appId: string, appSecret: string) => Promise<{
        success: boolean
        error?: string
      }>
      saveChannelConfig: (platform: OcbotChannelPlatform, config: OcbotChannelConfig) => Promise<OcbotChannelConfig>
      listChannelPairingRequests: (platform: OcbotChannelPlatform) => Promise<{
        requests: OcbotChannelPairingRequest[]
        allowFrom: string[]
      }>
      approveChannelPairingCode: (platform: OcbotChannelPlatform, code: string) => Promise<{ approved: boolean }>
      rejectChannelPairingRequest: (platform: OcbotChannelPlatform, code: string) => Promise<{ rejected: boolean }>
    }
  }

  // Defined by Vite at build time
  const __OCBOT_VERSION__: string
}

export {}
