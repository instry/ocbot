declare global {
  interface Window {
    ocbot?: {
      platform: string
      minimize: () => void
      maximize: () => void
      close: () => void
      installSkill: (slug: string, version?: string) => Promise<{ ok: boolean; message: string }>
      uninstallSkill: (slug: string) => Promise<{ ok: boolean; message: string }>
    }
  }

  // Defined by Vite at build time
  const __OCBOT_VERSION__: string
}

export {}
