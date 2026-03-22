import { gatewayRequest } from './client'

export async function getGatewayConfig(gatewayUrl: string): Promise<{ config: Record<string, unknown>; hash: string }> {
  const result = await gatewayRequest(gatewayUrl, 'config.get') as {
    config?: Record<string, unknown>
    hash?: string
  }
  return {
    config: result?.config ?? {},
    hash: result?.hash ?? '',
  }
}

export async function patchGatewayConfig(
  gatewayUrl: string,
  baseHash: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await gatewayRequest(gatewayUrl, 'config.patch', {
    baseHash,
    raw: JSON.stringify(patch),
  })
}
