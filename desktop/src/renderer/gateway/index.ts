import { GatewayClient, type GatewayState } from './client'

/**
 * Singleton gateway instance shared across all components.
 */

let _client: GatewayClient | null = null

function configureGatewayClient(url: string, token?: string | null): GatewayClient {
  if (_client) {
    return _client
  }

  _client = new GatewayClient(url, token ?? undefined)
  return _client
}

export function getGatewayClient(): GatewayClient {
  if (!_client) {
    throw new Error('Gateway client not initialized')
  }
  return _client
}

export function connectGateway(url: string, token?: string | null): GatewayClient {
  const client = configureGatewayClient(url, token)
  if (client.state === 'disconnected' || client.state === 'error') {
    client.connect()
  }
  return client
}

export { GatewayClient, type GatewayState }
