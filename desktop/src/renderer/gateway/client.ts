/**
 * Persistent WebSocket client for OpenClaw Gateway.
 *
 * Simplified for Ocbot's embedded gateway (localhost, no device auth).
 * Protocol: connect.challenge → connect → hello-ok, then req/res + events.
 */

import { OCBOT_VERSION } from '@/lib/constants'

export type GatewayState = 'disconnected' | 'connecting' | 'connected' | 'error'

export type GatewayEventHandler = (event: string, payload: unknown) => void

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const REQUEST_TIMEOUT_MS = 30_000
const BACKOFF_INITIAL_MS = 800
const BACKOFF_MAX_MS = 15_000

export class GatewayClient {
  private ws: WebSocket | null = null
  private _state: GatewayState = 'disconnected'
  private pending = new Map<string, PendingRequest>()
  private eventHandlers = new Set<GatewayEventHandler>()
  private stateHandlers = new Set<(state: GatewayState) => void>()
  private connectNonce: string | null = null
  private backoffMs = BACKOFF_INITIAL_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private url: string
  private token: string | null

  constructor(url: string, token?: string) {
    this.url = url
    this.token = token ?? null
  }

  get state(): GatewayState { return this._state }

  private setState(s: GatewayState) {
    if (this._state === s) return
    this._state = s
    for (const h of this.stateHandlers) h(s)
  }

  /** Subscribe to connection state changes. Returns unsubscribe function. */
  onStateChange(handler: (state: GatewayState) => void): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  /** Subscribe to gateway events. Returns unsubscribe function. */
  onEvent(handler: GatewayEventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  /** Connect to the gateway. */
  connect() {
    if (this.ws) return
    this.intentionalClose = false
    this.setState('connecting')

    const wsUrl = this.url.replace(/^http/, 'ws')
    const ws = new WebSocket(wsUrl)
    this.ws = ws

    ws.onopen = () => {
      // Wait for connect.challenge event from server
    }

    ws.onmessage = (e) => {
      this.handleMessage(e.data as string)
    }

    ws.onclose = () => {
      this.ws = null
      this.rejectAllPending('connection closed')
      if (this.intentionalClose) {
        this.setState('disconnected')
      } else {
        this.setState('error')
        this.scheduleReconnect()
      }
    }

    ws.onerror = () => {
      // onclose will fire after this
    }
  }

  /** Disconnect from the gateway. */
  disconnect() {
    this.intentionalClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.rejectAllPending('disconnected')
    this.setState('disconnected')
  }

  /** Send an RPC request. Returns the response payload. */
  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('gateway not connected')
    }

    const id = crypto.randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`gateway request '${method}' timed out`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })

      this.ws!.send(JSON.stringify({ type: 'req', id, method, params }))
    })
  }

  // --- Private ---

  private handleMessage(raw: string) {
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return }

    const frame = parsed as { type?: string }

    if (frame.type === 'event') {
      const evt = parsed as { event: string; payload?: unknown }

      // Handle connect.challenge
      if (evt.event === 'connect.challenge') {
        const payload = evt.payload as { nonce?: string } | undefined
        this.connectNonce = payload?.nonce ?? null
        this.sendConnect()
        return
      }

      // Dispatch to handlers
      for (const h of this.eventHandlers) {
        try { h(evt.event, evt.payload) } catch (err) {
          console.error('[gateway] event handler error:', err)
        }
      }
      return
    }

    if (frame.type === 'res') {
      const res = parsed as { id: string; ok: boolean; payload?: unknown; error?: { code: string; message: string } }
      const pending = this.pending.get(res.id)
      if (!pending) return
      this.pending.delete(res.id)
      clearTimeout(pending.timer)

      if (res.ok) {
        pending.resolve(res.payload)
      } else {
        pending.reject(new Error(res.error?.message ?? 'gateway error'))
      }
    }
  }

  private sendConnect() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    const params: Record<string, unknown> = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'openclaw-control-ui',
        version: OCBOT_VERSION,
        platform: navigator.platform ?? 'web',
        mode: 'webchat',
        instanceId: this.getInstanceId(),
      },
      role: 'operator',
      scopes: ['operator.admin'],
      caps: ['tool-events'],
      locale: navigator.language,
    }

    // Include auth token if available
    if (this.token) {
      params.auth = { token: this.token }
    }

    const id = crypto.randomUUID()
    this.pending.set(id, {
      resolve: () => {
        this.backoffMs = BACKOFF_INITIAL_MS
        this.setState('connected')
        // Subscribe to session events so chat events flow
        this.call('sessions.subscribe').catch(() => {})
      },
      reject: (err) => {
        console.error('[gateway] connect failed:', err)
        this.ws?.close()
      },
      timer: setTimeout(() => {
        this.pending.delete(id)
        console.error('[gateway] connect timed out')
        this.ws?.close()
      }, REQUEST_TIMEOUT_MS),
    })

    this.ws.send(JSON.stringify({ type: 'req', id, method: 'connect', params }))
  }

  private scheduleReconnect() {
    if (this.intentionalClose) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.backoffMs)
    this.backoffMs = Math.min(this.backoffMs * 1.5, BACKOFF_MAX_MS)
  }

  private rejectAllPending(reason: string) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
    }
    this.pending.clear()
  }

  private instanceId: string | null = null
  private getInstanceId(): string {
    if (!this.instanceId) {
      this.instanceId = crypto.randomUUID()
    }
    return this.instanceId
  }
}
