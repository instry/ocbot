import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'

/**
 * Applies the current theme to the document root element.
 * Should be called once at the app root.
 */
export function useTheme() {
  const themeName = useUIStore(s => s.themeName)
  const themeMode = useUIStore(s => s.themeMode)

  useEffect(() => {
    const root = document.documentElement

    // Apply theme mode
    root.setAttribute('data-theme-mode', themeMode)

    // Apply named theme (strip "-light" suffix for the data attribute)
    if (themeName === 'default') {
      root.removeAttribute('data-theme')
    } else {
      const baseName = themeName.replace('-light', '')
      root.setAttribute('data-theme', baseName)
    }

    // For Tailwind dark mode class
    root.classList.toggle('dark', themeMode === 'dark')
    root.classList.toggle('light', themeMode === 'light')
  }, [themeName, themeMode])
}
