import { create } from 'zustand'
import { GatewayClient, type GatewayState } from '@/gateway/client'
import { connectGateway } from '@/gateway'

interface GatewayStore {
  client: GatewayClient | null
  status: GatewayState
  reconnectAttempt: number
  initializing: boolean

  connect: () => void
  disconnect: () => void
}

export const useGatewayStore = create<GatewayStore>((set, get) => ({
  client: null,
  status: 'disconnected',
  reconnectAttempt: 0,
  initializing: false,

  connect: () => {
    if (get().client || get().initializing) return

    set({ initializing: true, status: 'connecting' })

    void window.ocbot?.getGatewayConnectionInfo()
      .then((info) => {
        const url = info?.url ?? 'http://127.0.0.1:18789'
        const token = info?.token ?? null
        const client = connectGateway(url, token)

        client.onStateChange((state) => {
          set({
            status: state,
            reconnectAttempt: state === 'connected'
              ? 0
              : state === 'error'
                ? get().reconnectAttempt + 1
                : get().reconnectAttempt,
          })
        })

        set({ client, status: client.state, initializing: false })
      })
      .catch((error) => {
        console.error('Failed to initialize gateway client:', error)
        set({ status: 'error', initializing: false })
      })
  },

  disconnect: () => {
    const { client } = get()
    if (client) {
      client.disconnect()
    }
    set({ client: null, status: 'disconnected', reconnectAttempt: 0, initializing: false })
  },
}))
