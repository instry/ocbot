import { useEffect } from 'react'
import { useGatewayStore } from '@/stores/gateway-store'

/**
 * Connects to the gateway on mount, disconnects on unmount.
 * Should be called once at the app root.
 */
export function useGateway() {
  const connect = useGatewayStore(s => s.connect)
  const disconnect = useGatewayStore(s => s.disconnect)
  const status = useGatewayStore(s => s.status)

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return status
}
