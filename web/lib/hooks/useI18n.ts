import { useCallback } from 'react'
import { useSettings } from './useSettings'
import en from '../i18n/locales/en.json'
import zh from '../i18n/locales/zh.json'

type Locale = typeof en

const locales: Record<string, Locale> = { en, zh }

function getNestedValue(obj: any, path: string): string {
  const keys = path.split('.')
  let current = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return path
    current = current[key]
  }
  return typeof current === 'string' ? current : path
}

export function useI18n() {
  const { language } = useSettings()

  const t = useCallback((key: string): string => {
    return getNestedValue(locales[language] ?? locales.en, key)
  }, [language])

  return { t, language }
}
