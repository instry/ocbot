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
    botToken?: string
    clientId?: string
    clientSecret?: string
    botId?: string
    secret?: string
    accountId?: string
    dmPolicy: OcbotChannelPolicy
    groupPolicy: OcbotChannelPolicy
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

  interface Window {
    ocbot?: {
      platform: string
      minimize: () => void
      maximize: () => void
      close: () => void
      installSkill: (slug: string, version?: string) => Promise<{ ok: boolean; message: string }>
      uninstallSkill: (slug: string) => Promise<{ ok: boolean; message: string }>
      getBrowserProfiles: () => Promise<OcbotBrowserProfilesResult[]>
      getOcbotBrowserPath: () => Promise<string>
      getChannelConfig: (platform: OcbotChannelPlatform) => Promise<OcbotChannelConfig>
      saveChannelConfig: (platform: OcbotChannelPlatform, config: OcbotChannelConfig) => Promise<OcbotChannelConfig>
    }
  }

  // Defined by Vite at build time
  const __OCBOT_VERSION__: string
}

export {}
