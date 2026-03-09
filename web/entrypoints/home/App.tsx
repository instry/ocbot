import { useState, useCallback, useRef, useEffect } from 'react'
import { WelcomeHero } from '@/components/WelcomeHero'
import { ChatInput } from '@/components/ChatInput'
import type { ChatInputHandle } from '@/components/ChatInput'
import { SuggestionChips } from '@/components/SuggestionChips'
import { Settings } from '@/components/Settings'
import { Sidebar } from './components/Sidebar'
import { SkillsPage } from './pages/SkillsPage'
import { AboutPage } from './pages/AboutPage'
import { useLlmProvider } from '@/lib/llm/useLlmProvider'
import { useSettings } from '@/lib/hooks/useSettings'
import type { LlmProvider } from '@/lib/llm/types'

type Page = 'new-session' | 'skills' | 'claw' | 'settings' | 'about'

function NewSessionPage({
  providers,
  selectedProvider,
  selectProvider,
  saveProvider,
  deleteProvider,
}: {
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  selectProvider: (id: string) => Promise<void>
  saveProvider: (provider: LlmProvider) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
}) {
  const chatInputRef = useRef<ChatInputHandle>(null)

  const handleSend = useCallback(async (text: string) => {
    await chrome.storage.local.set({ ocbot_pending_message: text })
    const { id: windowId } = await chrome.windows.getCurrent()
    await chrome.sidePanel.open({ windowId: windowId! })
  }, [])

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-6">
        <WelcomeHero size="lg" />
        <ChatInput
          ref={chatInputRef}
          onSend={handleSend}
          variant="standalone"
          rows={4}
          minHeight="min-h-[100px]"
          providers={providers}
          selectedProvider={selectedProvider}
          onSelectProvider={selectProvider}
          onSaveProvider={saveProvider}
          onDeleteProvider={deleteProvider}
        />
        <SuggestionChips onSelect={(skill) => {
          window.location.hash = `#/skills/detail?id=${skill.id}&source=marketplace`
        }} />
      </div>
    </div>
  )
}

export function App() {
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace('#/', '').split('?')[0]
    const base = hash.split('/')[0]
    if (['skills', 'claw', 'settings', 'about'].includes(base)) return base as Page
    return 'new-session'
  })
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()
  const { colorScheme, language, setColorScheme, setLanguage } = useSettings()

  const navigateTo = useCallback((p: Page) => {
    setPage(p)
    const hash = p === 'new-session' ? '#/home' : `#/${p}`
    history.replaceState(null, '', hash)
  }, [])

  // Sync page state when browser back/forward changes the hash
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#/', '').split('?')[0]
      const base = hash.split('/')[0]
      if (['skills', 'claw', 'settings', 'about'].includes(base)) {
        setPage(base as Page)
      } else {
        setPage('new-session')
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <Sidebar
        activePage={page}
        onNavigate={navigateTo}
        onSelectConversation={async (id) => {
          await chrome.storage.local.set({ ocbot_load_conversation: id })
          const { id: windowId } = await chrome.windows.getCurrent()
          await chrome.sidePanel.open({ windowId: windowId! })
        }}
      />
      <main className="flex-1 overflow-hidden">
        {page === 'new-session' && (
          <NewSessionPage
            providers={providers}
            selectedProvider={selectedProvider}
            selectProvider={selectProvider}
            saveProvider={saveProvider}
            deleteProvider={deleteProvider}
          />
        )}
        {page === 'skills' && <SkillsPage />}
        {page === 'claw' && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <svg className="h-16 w-16 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15C7 13 3 8 5 4C6 2 9 1 11 3" />
              <path d="M12 15C17 13 21 8 19 4C18 2 15 1 13 3" />
              <path d="M12 15V22" />
            </svg>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">Claw</h2>
              <p className="mt-1 text-sm">Coming soon</p>
            </div>
          </div>
        )}
        {page === 'settings' && (
          <Settings
            providers={providers}
            selectedProvider={selectedProvider}
            onSaveProvider={saveProvider}
            onDeleteProvider={deleteProvider}
            onSelectProvider={selectProvider}
            colorScheme={colorScheme}
            language={language}
            onColorSchemeChange={setColorScheme}
            onLanguageChange={setLanguage}
          />
        )}
        {page === 'about' && <AboutPage />}
      </main>
    </div>
  )
}
