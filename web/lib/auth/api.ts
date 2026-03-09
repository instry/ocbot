import { supabase } from './supabase'

const API_BASE = __OCBOT_API_URL__

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Not authenticated')
  }

  const url = `${API_BASE}${path}`
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  })
}

export async function registerDevice(deviceId: string, deviceName: string) {
  const res = await authFetch('/api/devices', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId, device_name: deviceName }),
  })
  if (!res.ok) {
    throw new Error(`Failed to register device: ${res.status}`)
  }
  return res.json()
}

export async function listDevices() {
  const res = await authFetch('/api/devices')
  if (!res.ok) {
    throw new Error(`Failed to list devices: ${res.status}`)
  }
  return res.json()
}
