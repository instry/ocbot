declare namespace chrome.ocbot {
  interface OpenClawProvider {
    providerId: string
    baseUrl: string
    apiFormat: string
    apiKey: string
    modelId: string
    modelName: string
    contextWindow: number
    maxTokens: number
  }

  interface OpenClawConfig {
    gatewayUrl?: string
    running: boolean
  }

  function setProvider(
    provider: OpenClawProvider,
    callback: (success: boolean) => void,
  ): void

  function getConfig(callback: (config: OpenClawConfig) => void): void
}
