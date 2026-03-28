import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ChevronDown, Globe, Info, Mail, Monitor, Moon, Sliders, Sun } from 'lucide-react'
import { getGatewayClient } from '@/gateway'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SelectionGroup } from '@/components/ui/selection-group'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import type { ThemeMode } from '@/stores/ui-store'

type SettingsTab = 'general' | 'browser' | 'about'
type BrowserChoice = 'ocbot' | 'system' | 'custom'

interface BrowserConfigResult {
  config?: {
    browser?: {
      executablePath?: string
      defaultProfile?: string | null
      profiles?: Record<string, { userDataDir?: string; driver?: string } | null>
    }
  }
  hash?: string
}

function resolveSelectedProfile(
  selectedProfileKey: string,
  browserProfiles: OcbotBrowserProfilesResult[],
): { profilePath: string } | null {
  if (!selectedProfileKey) return null

  const [kind, ...rest] = selectedProfileKey.split(':')
  const directory = rest.join(':')

  for (const browser of browserProfiles) {
    if (browser.browser.kind !== kind) continue
    const profile = browser.profiles.find(item => item.directory === directory)
    if (profile) {
      return {
        profilePath: profile.path,
      }
    }
  }

  return null
}

export function SettingsRoute() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const { themeMode, setThemeMode } = useUIStore()
  const [browserChoice, setBrowserChoice] = useState<BrowserChoice>('system')
  const [customBrowserPath, setCustomBrowserPath] = useState('')
  const [selectedProfileKey, setSelectedProfileKey] = useState('')
  const [savedBrowserChoice, setSavedBrowserChoice] = useState<BrowserChoice>('system')
  const [savedCustomBrowserPath, setSavedCustomBrowserPath] = useState('')
  const [savedProfileKey, setSavedProfileKey] = useState('')
  const [configHash, setConfigHash] = useState<string | null>(null)
  const [browserSaving, setBrowserSaving] = useState(false)
  const [browserSaveSuccess, setBrowserSaveSuccess] = useState(false)
  const [browserProfiles, setBrowserProfiles] = useState<OcbotBrowserProfilesResult[]>([])
  const [browserLoading, setBrowserLoading] = useState(true)
  const [browserError, setBrowserError] = useState<string | null>(null)
  const [ocbotBrowserPath, setOcbotBrowserPath] = useState('')

  const tabs = [
    { value: 'general' as const, label: 'General', icon: Sliders },
    { value: 'browser' as const, label: 'Browser', icon: Globe },
    { value: 'about' as const, label: 'About', icon: Info },
  ]

  const browserDirty = browserChoice !== savedBrowserChoice
    || customBrowserPath !== savedCustomBrowserPath
    || selectedProfileKey !== savedProfileKey

  const browserOptions = useMemo(() => {
    const options: Array<{
      value: BrowserChoice
      label: string
      icon: ReactElement
    }> = [
      {
        value: 'system',
        label: 'System',
        icon: <Globe className="h-4 w-4" />,
      },
      {
        value: 'custom',
        label: 'Custom',
        icon: <Sliders className="h-4 w-4" />,
      },
    ]

    if (ocbotBrowserPath) {
      options.unshift({
        value: 'ocbot',
        label: 'Ocbot',
        icon: <Monitor className="h-4 w-4" />,
      })
    }

    return options
  }, [ocbotBrowserPath])

  const browserSaveDisabled = !browserDirty
    || browserSaving
    || browserLoading
    || (browserChoice === 'custom' && !customBrowserPath.trim())
    || (browserChoice === 'ocbot' && !ocbotBrowserPath)

  useEffect(() => {
    void loadBrowserConfig()
  }, [])

  async function loadBrowserSupport() {
    const [profiles, ocbotPath] = await Promise.all([
      window.ocbot?.getBrowserProfiles() ?? Promise.resolve([]),
      window.ocbot?.getOcbotBrowserPath() ?? Promise.resolve(''),
    ])

    setBrowserProfiles(profiles)
    setOcbotBrowserPath(ocbotPath)

    return { profiles, ocbotPath }
  }

  function applyBrowserConfig(
    result: BrowserConfigResult,
    profiles: OcbotBrowserProfilesResult[],
    ocbotPath: string,
  ) {
    const hash = result?.hash ?? null
    const execPath = result?.config?.browser?.executablePath ?? ''
    const userProfile = result?.config?.browser?.profiles?.user

    let nextBrowserChoice: BrowserChoice = 'system'
    let nextCustomBrowserPath = ''
    let nextProfileKey = ''

    if (!execPath) {
      nextBrowserChoice = 'system'
    } else if (ocbotPath && execPath === ocbotPath) {
      nextBrowserChoice = 'ocbot'
    } else {
      nextBrowserChoice = 'custom'
      nextCustomBrowserPath = execPath
    }

    if (userProfile?.userDataDir && userProfile.driver === 'existing-session') {
      for (const browser of profiles) {
        for (const profile of browser.profiles) {
          if (profile.path === userProfile.userDataDir) {
            nextProfileKey = `${browser.browser.kind}:${profile.directory}`
            break
          }
        }
        if (nextProfileKey) break
      }
    }

    setConfigHash(hash)
    setBrowserChoice(nextBrowserChoice)
    setCustomBrowserPath(nextCustomBrowserPath)
    setSelectedProfileKey(nextProfileKey)
    setSavedBrowserChoice(nextBrowserChoice)
    setSavedCustomBrowserPath(nextCustomBrowserPath)
    setSavedProfileKey(nextProfileKey)
  }

  async function loadBrowserConfig() {
    setBrowserLoading(true)
    setBrowserError(null)

    try {
      const { profiles, ocbotPath } = await loadBrowserSupport()
      const result = await getGatewayClient().call<BrowserConfigResult>('config.get')
      applyBrowserConfig(result ?? {}, profiles, ocbotPath)
    } catch (err) {
      console.error('Failed to load browser config:', err)
      setBrowserError('Failed to load browser settings.')
    } finally {
      setBrowserLoading(false)
    }
  }

  function cancelBrowserConfig() {
    setBrowserChoice(savedBrowserChoice)
    setCustomBrowserPath(savedCustomBrowserPath)
    setSelectedProfileKey(savedProfileKey)
  }

  async function saveBrowserConfig() {
    if (browserSaveDisabled) return

    setBrowserSaving(true)
    setBrowserError(null)

    try {
      const executablePath = browserChoice === 'ocbot'
        ? ocbotBrowserPath
        : browserChoice === 'custom'
          ? customBrowserPath.trim()
          : null

      const browserPatch: Record<string, unknown> = {
        executablePath,
      }

      if (browserChoice === 'system' && selectedProfileKey) {
        const selectedProfile = resolveSelectedProfile(selectedProfileKey, browserProfiles)
        if (selectedProfile) {
          browserPatch.profiles = {
            user: {
              driver: 'existing-session',
              userDataDir: selectedProfile.profilePath,
              attachOnly: true,
              color: '#00AA00',
            },
          }
          browserPatch.defaultProfile = 'user'
        } else {
          browserPatch.profiles = { user: null }
          browserPatch.defaultProfile = null
        }
      } else {
        browserPatch.profiles = { user: null }
        browserPatch.defaultProfile = null
      }

      await getGatewayClient().call('config.patch', {
        baseHash: configHash ?? '',
        raw: JSON.stringify({ browser: browserPatch }),
      })

      const result = await getGatewayClient().call<BrowserConfigResult>('config.get')
      applyBrowserConfig(result ?? {}, browserProfiles, ocbotBrowserPath)
      setBrowserSaveSuccess(true)
      window.setTimeout(() => setBrowserSaveSuccess(false), 2500)
    } catch (err) {
      console.error('Failed to save browser config:', err)
      setBrowserError('Failed to save browser settings.')
    } finally {
      setBrowserSaving(false)
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-56 flex-col border-r border-border bg-bg-subtle/80 p-3">
        <div className="px-2 py-2">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Settings</div>
        </div>
        <nav className="mt-3 flex flex-1 flex-col gap-1">
          {tabs.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={activeTab === value ? 'tonal' : 'ghost'}
              className={cn(
                'justify-start rounded-xl px-3',
                activeTab !== value && 'border-transparent text-text hover:border-border',
              )}
              onClick={() => setActiveTab(value)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'general' && <GeneralTab themeMode={themeMode} setThemeMode={setThemeMode} />}
        {activeTab === 'browser' && (
          <BrowserTab
            browserChoice={browserChoice}
            browserError={browserError}
            browserLoading={browserLoading}
            browserDirty={browserDirty}
            browserOptions={browserOptions}
            browserProfiles={browserProfiles}
            browserSaveDisabled={browserSaveDisabled}
            browserSaveSuccess={browserSaveSuccess}
            browserSaving={browserSaving}
            selectedProfileKey={selectedProfileKey}
            setBrowserChoice={setBrowserChoice}
            setSelectedProfileKey={setSelectedProfileKey}
            onCancel={cancelBrowserConfig}
            onRefresh={loadBrowserConfig}
            onSave={saveBrowserConfig}
          />
        )}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}

function GeneralTab({ themeMode, setThemeMode }: { themeMode: ThemeMode; setThemeMode: (mode: ThemeMode) => void }) {
  const colorOptions = [
    {
      value: 'light' as const,
      label: 'Light',
      icon: <Sun className="h-4 w-4" />,
    },
    {
      value: 'dark' as const,
      label: 'Dark',
      icon: <Moon className="h-4 w-4" />,
    },
  ]

  return (
    <div className="flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-text-strong">General</h2>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-sm font-medium text-text-strong">Color Scheme</div>
        </div>
        <SelectionGroup
          value={themeMode}
          options={colorOptions}
          onChange={setThemeMode}
          size="compact"
          className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none grid-cols-2 sm:grid-cols-2"
        />
      </div>
    </div>
  )
}

function BrowserTab({
  browserChoice,
  browserDirty,
  browserError,
  browserLoading,
  browserOptions,
  browserProfiles,
  browserSaveDisabled,
  browserSaveSuccess,
  browserSaving,
  selectedProfileKey,
  setBrowserChoice,
  setSelectedProfileKey,
  onCancel,
  onRefresh,
  onSave,
}: {
  browserChoice: BrowserChoice
  browserDirty: boolean
  browserError: string | null
  browserLoading: boolean
  browserOptions: Array<{ value: BrowserChoice; label: string; icon: ReactElement }>
  browserProfiles: OcbotBrowserProfilesResult[]
  browserSaveDisabled: boolean
  browserSaveSuccess: boolean
  browserSaving: boolean
  selectedProfileKey: string
  setBrowserChoice: (value: BrowserChoice) => void
  setSelectedProfileKey: (value: string) => void
  onCancel: () => void
  onRefresh: () => void
  onSave: () => void
}) {
  return (
    <div className="flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-text-strong">Browser</h2>
        <p className="text-sm text-muted-foreground">Choose which browser the agent uses for web tasks and attached sessions.</p>
      </div>

      {browserError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {browserError}
        </div>
      ) : null}

      <SelectionGroup
        value={browserChoice}
        options={browserOptions}
        onChange={(value) => {
          if (!browserSaving) setBrowserChoice(value)
        }}
        className={cn(
          browserOptions.length >= 3 ? 'grid-cols-3 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-2',
          browserSaving && 'pointer-events-none opacity-60',
        )}
      />

      {browserChoice === 'system' ? (
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Attach to an existing Chromium profile with saved logins and cookies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {browserProfiles.length > 0 ? (
              <div className="relative">
                <select
                  value={selectedProfileKey}
                  onChange={(event) => setSelectedProfileKey(event.target.value)}
                  disabled={browserSaving || browserLoading}
                  className="w-full appearance-none rounded-xl border border-border bg-bg px-3 py-2 pr-11 text-sm text-text shadow-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Auto-detect</option>
                  {browserProfiles.map((browser) => (
                    <optgroup
                      key={browser.browser.kind}
                      label={browser.browser.kind.charAt(0).toUpperCase() + browser.browser.kind.slice(1)}
                    >
                      {browser.profiles.map((profile) => (
                        <option key={`${browser.browser.kind}:${profile.directory}`} value={`${browser.browser.kind}:${profile.directory}`}>
                          {profile.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-bg-subtle/60 px-3 py-2 text-sm text-muted-foreground">
                No local Chromium profiles were detected. The agent will use the system browser without attaching to a saved profile.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-start gap-3 border-t border-border/80 pt-4">
        <Button variant="ghost" size="md" className="min-w-[108px]" onClick={onRefresh} disabled={browserSaving}>
          Refresh
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="min-w-[108px]"
          onClick={onCancel}
          disabled={browserSaving || !browserDirty}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          className="min-w-[116px]"
          onClick={onSave}
          disabled={browserSaveDisabled}
        >
          {browserSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function AboutTab() {
  const version = typeof __OCBOT_VERSION__ !== 'undefined' ? __OCBOT_VERSION__ : 'dev'

  const faqs = [
    { q: 'What are you exactly?', a: "I'm a new species! Part browser, part AI agent. Think of me as a very helpful octopus that lives in your browser tabs." },
    { q: 'Why the name "ocbot"?', a: 'Because "octo" means 8! I\'m an octopus-inspired bot with eight arms ready to multitask across the web.' },
    { q: 'Why purple?', a: "Because I'm hitting the big time — only royalty gets to be purple. Plus it's the color of a certain deep-sea creature." },
    { q: 'Will you leak my data?', a: "Nope! All your data is stored locally. I don't phone home. Your conversations, your settings — all yours." },
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col items-center text-center">
        <img src="./logo.png" alt="Ocbot" className="mb-4 h-16 w-16" />
        <h1 className="mb-2 text-2xl font-bold text-text-strong">ocbot</h1>
        <p className="text-sm text-muted-foreground">Got brains, got arms, up before the alarm.</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <p className="text-sm leading-relaxed text-text">
            My name is ocbot. I'm super smart and super quick at getting things done.
            I live inside your browser with eight nimble arms ready to handle any task.
            Ask me to find info, fill forms, compare products, or automate your online work.
            I don't sleep, I don't forget, and I'm always ready.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {faqs.map((f, i) => (
            <Card key={i} className="bg-bg-subtle/60 shadow-none">
              <CardContent className="space-y-1 p-4">
                <p className="text-sm font-medium text-text-strong">Q: {f.q}</p>
                <p className="text-sm text-text">{f.a}</p>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Card className="-mt-2 border-transparent bg-transparent shadow-none">
        <CardContent className="flex flex-col items-center gap-3 p-4">
          <div className="flex gap-3 text-sm">
            <a
              href="https://oc.bot"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-accent no-underline transition-colors hover:bg-bg-hover"
            >
              <Globe className="h-3.5 w-3.5" />
              oc.bot
            </a>
            <a
              href="mailto:hi@oc.bot"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-accent no-underline transition-colors hover:bg-bg-hover"
            >
              <Mail className="h-3.5 w-3.5" />
              hi@oc.bot
            </a>
          </div>
        </CardContent>
      </Card>

      <div className="-mt-3 flex justify-center">
        <Badge variant="accent">v{version}</Badge>
      </div>
    </div>
  )
}
