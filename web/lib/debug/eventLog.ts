// lib/debug/eventLog.ts — Structured debug event logger for Phase 2 verification
// Uses chrome.storage.session (fast, doesn't persist across browser restart)

export type DebugCategory = 'L1' | 'L2' | 'L3' | 'diff' | 'selector' | 'execution' | 'fragility' | 'evolution'

export interface DebugEvent {
  id: number
  ts: number
  cat: DebugCategory
  msg: string
  data?: unknown
}

const STORAGE_KEY = 'ocbot_debug_events'
const MAX_EVENTS = 500
let nextId = 1

/**
 * Append a debug event to session storage (FIFO, capped at 500).
 */
export async function logDebug(cat: DebugCategory, msg: string, data?: unknown): Promise<void> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY)
    const events: DebugEvent[] = (result[STORAGE_KEY] as DebugEvent[]) || []

    const event: DebugEvent = {
      id: nextId++,
      ts: Date.now(),
      cat,
      msg,
      data,
    }

    events.push(event)

    // FIFO cap
    while (events.length > MAX_EVENTS) {
      events.shift()
    }

    await chrome.storage.session.set({ [STORAGE_KEY]: events })
  } catch {
    // Best effort — don't break the app if session storage fails
    console.warn('[ocbot:debug] Failed to log event:', msg)
  }
}

/**
 * Get all debug events from session storage.
 */
export async function getDebugEvents(): Promise<DebugEvent[]> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY)
    return (result[STORAGE_KEY] as DebugEvent[]) || []
  } catch {
    return []
  }
}

/**
 * Clear all debug events.
 */
export async function clearDebugEvents(): Promise<void> {
  try {
    await chrome.storage.session.remove(STORAGE_KEY)
  } catch {
    // Best effort
  }
}

/**
 * Subscribe to new debug events via chrome.storage.session.onChanged.
 * Returns an unsubscribe function.
 */
export function onDebugEvent(cb: (events: DebugEvent[]) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    if (changes[STORAGE_KEY]) {
      const newEvents = (changes[STORAGE_KEY].newValue as DebugEvent[]) || []
      cb(newEvents)
    }
  }

  chrome.storage.session.onChanged.addListener(listener)
  return () => chrome.storage.session.onChanged.removeListener(listener)
}
