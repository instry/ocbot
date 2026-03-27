import { create } from 'zustand'
import { GatewayClient, type GatewayState } from '@/gateway/client'
import { connectGateway } from '@/gateway'

interface GatewayStore {
  client: GatewayClient | null
  status: GatewayState
  reconnectAttempt: number

  connect: () => void
  disconnect: () => void
}

export const useGatewayStore = create<GatewayStore>((set, get) => ({
  client: null,
  status: 'disconnected',
  reconnectAttempt: 0,

  connect: () => {
    if (get().client) return

    const client = connectGateway()

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

    set({ client, status: client.state })
  },

  disconnect: () => {
    const { client } = get()
    if (client) {
      client.disconnect()
    }
    set({ client: null, status: 'disconnected', reconnectAttempt: 0 })
  },
}))
