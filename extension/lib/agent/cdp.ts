export type CdpSender = <R = unknown>(method: string, params?: object) => Promise<R>

const CDP_VERSION = '1.3'

const attachedTabs = new Set<number>()

export async function ensureAttached(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) return
  try {
    await chrome.debugger.attach({ tabId }, CDP_VERSION)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Already attached — treat as success
    if (msg.includes('Already attached')) {
      attachedTabs.add(tabId)
      return
    }
    throw err
  }
  attachedTabs.add(tabId)
}

export async function sendCdp<R = unknown>(
  tabId: number,
  method: string,
  params?: object,
): Promise<R> {
  const result = await chrome.debugger.sendCommand({ tabId }, method, params)
  return result as R
}

export async function detachCdp(tabId: number): Promise<void> {
  if (!attachedTabs.has(tabId)) return
  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    // Ignore detach errors (tab might already be closed)
  }
  attachedTabs.delete(tabId)
}

export async function withCdpSession<T>(
  tabId: number,
  fn: (send: CdpSender) => Promise<T>,
): Promise<T> {
  await ensureAttached(tabId)
  const send: CdpSender = <R = unknown>(method: string, params?: object) =>
    sendCdp<R>(tabId, method, params)
  return fn(send)
}

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId)
})
