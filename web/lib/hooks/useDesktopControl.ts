import { useState, useEffect, useCallback } from 'react'
import { getDesktopEnabled, setDesktopEnabled } from '../storage'
import { storage } from '../storage-backend'

export interface DesktopPermissions {
  supported: boolean
  accessibility?: boolean
  screenRecording?: boolean
}

export function useDesktopControl() {
  const [enabled, setEnabled] = useState(false)
  const [permissions, setPermissions] = useState<DesktopPermissions | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    getDesktopEnabled().then(setEnabled)
    const unsub = storage.onChanged((changes) => {
      if (changes['ocbot_desktop_enabled']?.newValue !== undefined) {
        setEnabled(changes['ocbot_desktop_enabled'].newValue as boolean)
      }
    })
    return unsub
  }, [])

  const checkPermissions = useCallback(async (): Promise<DesktopPermissions> => {
    if (typeof chrome === 'undefined' || !chrome.ocbot?.checkPermissions) {
      const fallback: DesktopPermissions = { supported: false }
      setPermissions(fallback)
      return fallback
    }
    setChecking(true)
    try {
      const status = await new Promise<DesktopPermissions>((resolve) => {
        chrome.ocbot.checkPermissions((result) => resolve(result))
      })
      setPermissions(status)
      return status
    } catch {
      const fallback: DesktopPermissions = { supported: false }
      setPermissions(fallback)
      return fallback
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => { checkPermissions() }, [checkPermissions])

  const toggle = useCallback(async (value: boolean) => {
    if (value) {
      await checkPermissions()
    }
    await setDesktopEnabled(value)
    setEnabled(value)
  }, [checkPermissions])

  const openPermissionSettings = useCallback((type: 'accessibility' | 'screenRecording') => {
    if (chrome.ocbot?.requestPermission) {
      chrome.ocbot.requestPermission(type, () => {
        setTimeout(() => checkPermissions(), 1500)
      })
    }
  }, [checkPermissions])

  return { enabled, permissions, checking, toggle, checkPermissions, openPermissionSettings }
}
