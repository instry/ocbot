import { useState, useCallback, useRef, useEffect } from 'react'
import { WelcomeHero } from '@/components/WelcomeHero'
import { ChatInput } from '@/components/ChatInput'
import type { ChatInputHandle } from '@/components/ChatInput'
import { SuggestionChips } from '@/components/SuggestionChips'
import { Settings } from '@/components/Settings'
import { Sidebar } from './components/Sidebar'
import { SkillsPage } from './pages/SkillsPage'
import { AboutPage } from './pages/AboutPage'
import { CronPage } from './pages/CronPage'
import { Onboarding } from '@/components/Onboarding'
import { useLlmProvider } from '@/lib/llm/useLlmProvider'
import { useSettings } from '@/lib/hooks/useSettings'
import { I18nProvider, useI18n } from '@/lib/i18n/context'
import { useWallet } from '@/lib/hooks/useWallet'
import { isOnboardingComplete } from '@/lib/storage'
import type { LlmProvider } from '@/lib/llm/types'

type Page = 'new-session' | 'skills' | 'mobile' | 'cron' | 'settings' | 'about'

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

function MobilePage() {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <svg className="h-16 w-16 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
        <path d="M12 18h.01" />
      </svg>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">{t('mobile.title')}</h2>
        <p className="mt-1 text-sm">{t('mobile.comingSoon')}</p>
      </div>
    </div>
  )
}

export function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace('#/', '').split('?')[0]
    const base = hash.split('/')[0]
    if (['skills', 'mobile', 'cron', 'settings', 'about'].includes(base)) return base as Page
    return 'new-session'
  })
  const { providers, selectedProvider, saveProvider, deleteProvider, selectProvider } = useLlmProvider()
  const { colorScheme, language, setColorScheme, setLanguage } = useSettings()
  const wallet = useWallet()

  // Check if onboarding is needed
  useEffect(() => {
    isOnboardingComplete().then(complete => {
      if (complete) {
        setShowOnboarding(false)
      } else {
        // Also check if providers already exist
        setShowOnboarding(providers.length === 0)
      }
    })
  }, [providers.length])

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
      if (['skills', 'mobile', 'cron', 'settings', 'about'].includes(base)) {
        setPage(base as Page)
      } else {
        setPage('new-session')
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <I18nProvider locale={language}>
      {showOnboarding ? (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      ) : showOnboarding === null ? (
        // Loading state while checking onboarding status
        <div className="flex h-screen w-screen items-center justify-center bg-background" />
      ) : (
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
          {page === 'mobile' && <MobilePage />}
          {page === 'cron' && <CronPage />}
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
              wallet={wallet}
            />
          )}
          {page === 'about' && <AboutPage />}
        </main>
      </div>
      )}
    </I18nProvider>
  )
}
