import { useState, useEffect, useCallback } from 'react'
import { storage } from '../storage-backend'
import { detectSystemLocale } from '../i18n'

export type ColorScheme = 'system' | 'light' | 'dark'
export type Language = 'en' | 'zh'

const STORAGE_KEY = 'ocbot_settings'

interface AppSettings {
  colorScheme: ColorScheme
  language: Language
}

const DEFAULT_SETTINGS: AppSettings = {
  colorScheme: 'system',
  language: detectSystemLocale(),
}

function applyColorScheme(scheme: ColorScheme) {
  const root = document.documentElement
  if (scheme === 'dark') {
    root.classList.add('dark')
  } else if (scheme === 'light') {
    root.classList.remove('dark')
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  // Load from storage on mount
  useEffect(() => {
    storage.get(STORAGE_KEY).then(result => {
      const stored = result[STORAGE_KEY] as Partial<AppSettings> | undefined
      if (stored) {
        const merged = { ...DEFAULT_SETTINGS, ...stored }
        setSettings(merged)
        applyColorScheme(merged.colorScheme)
      } else {
        applyColorScheme(DEFAULT_SETTINGS.colorScheme)
      }
    })
  }, [])

  // Listen for system color scheme changes when in 'system' mode
  useEffect(() => {
    if (settings.colorScheme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyColorScheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.colorScheme])

  // Listen for storage changes from other contexts
  useEffect(() => {
    const unsubscribe = storage.onChanged((changes) => {
      if (changes[STORAGE_KEY]?.newValue) {
        const updated = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue }
        setSettings(updated)
        applyColorScheme(updated.colorScheme)
      }
    })
    return unsubscribe
  }, [])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    await storage.set({ [STORAGE_KEY]: updated })
    if (patch.colorScheme) {
      applyColorScheme(patch.colorScheme)
    }
  }, [settings])

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    updateSettings({ colorScheme: scheme })
  }, [updateSettings])

  const setLanguage = useCallback((lang: Language) => {
    updateSettings({ language: lang })
  }, [updateSettings])

  return {
    colorScheme: settings.colorScheme,
    language: settings.language,
    setColorScheme,
    setLanguage,
  }
}
