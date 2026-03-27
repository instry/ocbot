import { GatewayClient, type GatewayState } from './client'

/**
 * Singleton gateway instance shared across all components.
 */

let _client: GatewayClient | null = null

export function getGatewayClient(): GatewayClient {
  if (!_client) {
    _client = new GatewayClient('http://127.0.0.1:18789')
  }
  return _client
}

export function connectGateway(): GatewayClient {
  const client = getGatewayClient()
  if (client.state === 'disconnected' || client.state === 'error') {
    client.connect()
  }
  return client
}

export { GatewayClient, type GatewayState }
