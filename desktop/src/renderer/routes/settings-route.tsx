import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ArrowDownToLine, CheckCircle2, ChevronDown, ExternalLink, Globe, Info, LoaderCircle, Mail, Monitor, Moon, RefreshCw, Sliders, Sun } from 'lucide-react'
import { getGatewayClient } from '@/gateway'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SelectionGroup } from '@/components/ui/selection-group'
import { OCBOT_VERSION } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import type { ThemeMode } from '@/stores/ui-store'

type SettingsTab = 'general' | 'browser' | 'updates' | 'about'
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
    { value: 'updates' as const, label: 'Updates', icon: ArrowDownToLine },
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
        {activeTab === 'updates' && <UpdatesTab />}
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
                  className="w-full appearance-none rounded-xl border border-border bg-bg px-3 py-2 pr-11 text-sm text-text shadow-sm outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
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

function formatUpdateDate(value: string): string {
  if (!value) return 'Pending release'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return 'Unknown size'

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const digits = size >= 100 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(digits)} ${units[unitIndex]}`
}

function formatSpeed(value?: number): string | null {
  if (!value || value <= 0) return null
  return `${formatBytes(value)}/s`
}

function isUnavailableUpdateError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('Updates are not available yet.')
    || error.message.includes('Failed to load update manifest (404)')
}

const UPDATE_INFO_UNAVAILABLE_NOTICE = 'No update information is available yet.'

function UpdatesTab() {
  const [checking, setChecking] = useState(true)
  const [updateInfo, setUpdateInfo] = useState<OcbotAppUpdateInfo | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateNotice, setUpdateNotice] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<OcbotAppUpdateDownloadProgress | null>(null)
  const [downloadFilePath, setDownloadFilePath] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [upToDate, setUpToDate] = useState(false)

  useEffect(() => {
    const unsubscribe = window.ocbot?.appUpdate.onDownloadProgress((progress) => {
      setDownloadProgress(progress)
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    void checkForUpdates(false)
  }, [])

  async function checkForUpdates(triggeredByUser: boolean) {
    setChecking(true)
    setUpdateError(null)
    setUpdateNotice(null)
    setDownloadFilePath('')
    setDownloadProgress(null)

    try {
      const result = await window.ocbot?.appUpdate.check()
      setUpdateInfo(result ?? null)
      setUpToDate(!result)
      if (!result && triggeredByUser) {
        setUpdateNotice('You are already on the latest version.')
      }
    } catch (err) {
      setUpdateInfo(null)
      setUpToDate(false)
      if (isUnavailableUpdateError(err)) {
        if (triggeredByUser) {
          setUpdateNotice(UPDATE_INFO_UNAVAILABLE_NOTICE)
        }
      } else {
        setUpdateError(err instanceof Error ? err.message : 'Failed to check for updates.')
      }
    } finally {
      setChecking(false)
      setDownloading(false)
      setInstalling(false)
    }
  }

  async function downloadUpdate() {
    if (!updateInfo || downloading) return

    setDownloading(true)
    setUpdateError(null)
    setUpdateNotice(null)
    setDownloadProgress(null)

    try {
      const result = await window.ocbot?.appUpdate.download(updateInfo.download, updateInfo.latestVersion)
      setDownloadFilePath(result?.filePath ?? '')
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to download update.')
    } finally {
      setDownloading(false)
    }
  }

  async function cancelDownload() {
    if (!downloading) return

    try {
      await window.ocbot?.appUpdate.cancelDownload()
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  async function installUpdate() {
    if (!downloadFilePath || installing) return

    setInstalling(true)
    setUpdateError(null)
    setUpdateNotice(null)

    try {
      await window.ocbot?.appUpdate.install(downloadFilePath)
    } catch (err) {
      setInstalling(false)
      setUpdateError(err instanceof Error ? err.message : 'Failed to install update.')
    }
  }

  const progressPercent = typeof downloadProgress?.percent === 'number'
    ? Math.max(0, Math.min(100, Math.round(downloadProgress.percent * 100)))
    : null
  const progressSpeed = formatSpeed(downloadProgress?.speed)
  const latestVersionLabel = updateInfo?.latestVersion ?? OCBOT_VERSION
  const releaseDateLabel = formatUpdateDate(updateInfo?.publishedAt ?? '')
  const showPlainUpdateNotice = updateNotice === UPDATE_INFO_UNAVAILABLE_NOTICE
  const updateStatus = checking
    ? 'Checking for updates...'
    : updateInfo
      ? downloadFilePath
        ? `Version ${updateInfo.latestVersion} is ready to install.`
        : `Version ${updateInfo.latestVersion} is available.`
      : upToDate
        ? 'You are on the latest version.'
        : 'No update information available yet.'

  return (
    <div className="flex max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-text-strong">Updates</h2>
        <p className="text-sm text-muted-foreground">Check, download, and install the latest version.</p>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Version v{OCBOT_VERSION}</CardTitle>
          <CardDescription>
            Latest v{latestVersionLabel}
            {releaseDateLabel !== '—' ? ` • Released ${releaseDateLabel}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showPlainUpdateNotice ? (
            <div className={cn(
              'rounded-2xl border px-4 py-3 text-sm',
              checking
                ? 'border-border bg-bg-subtle/60 text-text'
                : updateInfo
                ? 'border-button-success-border bg-button-success text-button-success-foreground'
                : upToDate
                  ? 'border-border bg-bg-subtle/60 text-text'
                  : 'border-border bg-bg-subtle/60 text-text',
            )}>
              <div className="flex items-center gap-2">
                {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span>{updateStatus}</span>
              </div>
            </div>
          ) : null}

          {updateError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {updateError}
            </div>
          ) : null}

          {updateNotice ? (
            <div className={cn(
              'px-1 text-sm',
              showPlainUpdateNotice ? 'text-muted-foreground' : 'rounded-2xl border border-border bg-bg-subtle/60 px-4 py-3 text-text',
            )}>
              {updateNotice}
            </div>
          ) : null}

          {downloading ? (
            <div className="space-y-3 rounded-2xl border border-border bg-bg-subtle/60 p-4">
              <div className="flex items-center justify-between gap-3 text-sm text-text">
                <span>Downloading update</span>
                <span>{progressPercent !== null ? `${progressPercent}%` : 'Preparing...'}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-border/60">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${progressPercent ?? 8}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{formatBytes(downloadProgress?.received ?? 0)} / {formatBytes(downloadProgress?.total)}</span>
                {progressSpeed ? <span>{progressSpeed}</span> : null}
              </div>
            </div>
          ) : null}

          {updateInfo?.notes.length ? (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="text-sm font-medium text-text-strong">Release notes</div>
              <ul className="space-y-2 text-sm text-text">
                {updateInfo.notes.map((note, index) => (
                  <li key={`${index}-${note}`} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" size="md" onClick={() => void checkForUpdates(true)} disabled={checking || downloading || installing}>
              {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Check again
            </Button>
            {updateInfo && !downloadFilePath ? (
              <Button
                variant={downloading ? 'danger' : 'primary'}
                size="md"
                onClick={() => {
                  if (downloading) {
                    void cancelDownload()
                    return
                  }
                  void downloadUpdate()
                }}
                disabled={checking || installing}
              >
                {downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                {downloading ? 'Cancel download' : `Download ${formatBytes(updateInfo.download.size)}`}
              </Button>
            ) : null}
            {downloadFilePath ? (
              <Button variant="primary" size="md" onClick={() => void installUpdate()} disabled={installing || checking}>
                {installing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {installing ? 'Installing...' : 'Install update'}
              </Button>
            ) : null}
            {updateInfo?.releaseUrl ? (
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-accent no-underline transition-colors hover:bg-bg-hover"
              >
                <ExternalLink className="h-4 w-4" />
                View release
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AboutTab() {
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
          <div className="text-sm text-muted-foreground">v{OCBOT_VERSION}</div>
        </CardContent>
      </Card>
    </div>
  )
}
