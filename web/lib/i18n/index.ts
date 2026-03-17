import en from './locales/en.json'
import zh from './locales/zh.json'

export type Locale = 'en' | 'zh'

const messages: Record<Locale, Record<string, string>> = { en, zh }

export function detectSystemLocale(): Locale {
  try {
    const uiLang = chrome.i18n?.getUILanguage?.() ?? navigator.language
    if (uiLang.startsWith('zh')) return 'zh'
    return 'en'
  } catch {
    return 'en'
  }
}

export function createT(locale: Locale) {
  const dict = messages[locale] ?? messages.en
  const fallback = messages.en

  return function t(key: string, params?: Record<string, string | number>): string {
    let text = dict[key] ?? fallback[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return text
  }
}
