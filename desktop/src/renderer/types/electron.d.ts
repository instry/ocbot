declare global {
  interface Window {
    ocbot?: {
      platform: string
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }

  // Defined by Vite at build time
  const __OCBOT_VERSION__: string
}

export {}
