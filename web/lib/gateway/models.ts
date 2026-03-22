import { gatewayRequest } from './client'

export interface GatewayModel {
  id: string
  name: string
  provider: string
  contextWindow?: number
  reasoning?: boolean
}

export async function listModels(gatewayUrl: string): Promise<GatewayModel[]> {
  const result = await gatewayRequest(gatewayUrl, 'models.list') as {
    models?: GatewayModel[]
  }
  return result?.models ?? []
}
