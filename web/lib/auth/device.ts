const DEVICE_ID_KEY = 'ocbot_device_id'

export async function getOrCreateDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(DEVICE_ID_KEY)
  if (result[DEVICE_ID_KEY]) {
    return result[DEVICE_ID_KEY] as string
  }

  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: id })
  return id
}

export function getDeviceName(): string {
  const ua = navigator.userAgent
  if (ua.includes('Mac OS')) return 'macOS'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Linux')) return 'Linux'
  if (ua.includes('CrOS')) return 'ChromeOS'
  return 'Unknown'
}
