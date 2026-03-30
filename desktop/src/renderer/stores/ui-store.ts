import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeName = 'default' | 'openknot' | 'openknot-light' | 'dash' | 'dash-light'
export type ThemeMode = 'dark' | 'light'

export type Tab = 'chat' | 'skills' | 'cron' | 'models' | 'channels' | 'settings'

interface UIStore {
  // Sidebar
  tab: Tab
  sessionPanelOpen: boolean

  // Theme
  themeName: ThemeName
  themeMode: ThemeMode

  // Actions
  setTab: (tab: Tab) => void
  toggleSessionPanel: () => void
  setSessionPanelOpen: (open: boolean) => void
  setTheme: (name: ThemeName) => void
  setThemeMode: (mode: ThemeMode) => void
  toggleThemeMode: () => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      tab: 'chat',
      sessionPanelOpen: true,
      themeName: 'default',
      themeMode: 'light',

      setTab: (tab) => set({ tab }),

      toggleSessionPanel: () =>
        set(s => ({ sessionPanelOpen: !s.sessionPanelOpen })),

      setSessionPanelOpen: (open) => set({ sessionPanelOpen: open }),

      setTheme: (name) => {
        const mode = name.includes('light') ? 'light' as const : 'dark' as const
        set({ themeName: name, themeMode: mode })
      },

      setThemeMode: (mode) => set({ themeMode: mode }),

      toggleThemeMode: () =>
        set(s => ({
          themeMode: s.themeMode === 'dark' ? 'light' : 'dark',
        })),
    }),
    {
      name: 'ocbot-ui-preferences',
      partialize: (state) => ({
        themeName: state.themeName,
        themeMode: state.themeMode,
        sessionPanelOpen: state.sessionPanelOpen,
      }),
    }
  )
)
