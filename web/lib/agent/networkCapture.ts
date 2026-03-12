import { sendCdp } from './cdp'

// --- Types ---

export interface CapturedExchange {
  request: {
    method: string          // 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    headers: Record<string, string>
    postData?: string
    resourceType: string    // 'XHR' | 'Fetch'
  }
  response: {
    status: number
    headers: Record<string, string>
    body?: string           // Only for mutation requests, < 256KB
  }
}

// --- URL filtering ---

const FILTERED_DOMAINS = [
  'google-analytics.com',
  'analytics',
  'tracking',
  'sentry.io',
  'hotjar.com',
  'facebook.com/tr',
  'doubleclick.net',
  'googlesyndication',
]

const STATIC_RESOURCE_RE = /\.(js|css|png|jpg|svg|woff|ico)(\?|$)/

function isFiltered(url: string): boolean {
  if (STATIC_RESOURCE_RE.test(url)) return true
  const lower = url.toLowerCase()
  return FILTERED_DOMAINS.some(d => lower.includes(d))
}

// --- Mutation method filter ---

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// --- Max response body size (256KB) ---

const MAX_BODY_SIZE = 262144

// --- NetworkCapture ---

export class NetworkCapture {
  private pendingRequests = new Map<string, {
    request: CapturedExchange['request']
    responseStatus?: number
    responseHeaders?: Record<string, string>
  }>()
  private exchanges: CapturedExchange[] = []
  private listener: ((source: chrome.debugger.Debuggee, method: string, params?: any) => void) | null = null
  private tabId = 0

  async start(tabId: number): Promise<void> {
    this.tabId = tabId
    this.pendingRequests.clear()
    this.exchanges = []

    await sendCdp(tabId, 'Network.enable', {})

    this.listener = (source, method, params) => {
      if (source.tabId !== this.tabId) return

      if (method === 'Network.requestWillBeSent') {
        const { requestId, request, type } = params
        if (!MUTATION_METHODS.has(request.method)) return
        if (type !== 'XHR' && type !== 'Fetch') return

        this.pendingRequests.set(requestId, {
          request: {
            method: request.method,
            url: request.url,
            headers: request.headers || {},
            postData: request.postData,
            resourceType: type,
          },
        })
      }

      if (method === 'Network.responseReceived') {
        const { requestId, response } = params
        const pending = this.pendingRequests.get(requestId)
        if (pending) {
          pending.responseStatus = response.status
          pending.responseHeaders = response.headers || {}
        }
      }
    }

    chrome.debugger.onEvent.addListener(this.listener)
  }

  async stop(tabId: number): Promise<CapturedExchange[]> {
    if (this.listener) {
      chrome.debugger.onEvent.removeListener(this.listener)
      this.listener = null
    }

    // Collect response bodies for completed requests
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.responseStatus == null) continue

      let body: string | undefined
      try {
        const result = await sendCdp<{ body: string; base64Encoded: boolean }>(
          tabId, 'Network.getResponseBody', { requestId },
        )
        if (result.body && result.body.length <= MAX_BODY_SIZE) {
          body = result.body
        }
      } catch {
        // Body may have been GC'd by the browser
      }

      this.exchanges.push({
        request: pending.request,
        response: {
          status: pending.responseStatus,
          headers: pending.responseHeaders || {},
          body,
        },
      })
    }

    await sendCdp(tabId, 'Network.disable', {}).catch(() => {})

    this.pendingRequests.clear()

    return this.exchanges.filter(e => !isFiltered(e.request.url))
  }
}
