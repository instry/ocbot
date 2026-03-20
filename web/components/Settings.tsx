import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Sliders, Cpu, Wallet, Plus, Trash2, Pencil, Star, ArrowLeft, ChevronDown, Sun, Moon, Monitor, Globe, Check, Circle, Loader2 } from 'lucide-react'
import type { LlmProvider } from '@/lib/llm/types'
import { getTemplateByType } from '@/lib/llm/models'
import type { ColorScheme, Language } from '@/lib/hooks/useSettings'
import type { WalletActions } from '@/lib/wallet/types'
import { ProviderForm } from './ProviderForm'
import { useI18n } from '@/lib/i18n/context'
import { getOpenClawConfig, setOpenClawConfig } from '@/lib/storage'
import { WalletTab } from './WalletTab'

type SettingsTab = 'general' | 'providers' | 'wallet'
type ProvidersView = 'list' | 'add' | 'edit'
type OpenClawStatus = 'idle' | 'connected' | 'disconnected' | 'testing'

interface SettingsProps {
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  onSaveProvider: (provider: LlmProvider) => Promise<void>
  onDeleteProvider: (id: string) => Promise<void>
  onSelectProvider: (id: string) => Promise<void>
  colorScheme: ColorScheme
  language: Language
  onColorSchemeChange: (scheme: ColorScheme) => void
  onLanguageChange: (lang: Language) => void
  wallet: WalletActions
}

export function Settings({
  providers, selectedProvider, onSaveProvider, onDeleteProvider, onSelectProvider,
  colorScheme, language, onColorSchemeChange, onLanguageChange, wallet,
}: SettingsProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers')
  const [providersView, setProvidersView] = useState<ProvidersView>('list')
  const [editingProvider, setEditingProvider] = useState<LlmProvider | null>(null)

  const tabs: { id: SettingsTab; label: string; icon: typeof Sliders }[] = [
    { id: 'providers', label: t('models.title'), icon: Cpu },
    { id: 'general', label: t('settings.general'), icon: Sliders },
  ]

  return (
    <div className="flex h-full">
      <div className="flex w-48 shrink-0 flex-col border-r border-border/40 bg-muted/20">
        <div className="flex flex-col gap-1 px-3 pt-6 pb-4">
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{t('settings.title')}</h2>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); if (id === 'providers') setProvidersView('list') }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeTab === id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'general' && (
          <GeneralTab
            colorScheme={colorScheme}
            language={language}
            onColorSchemeChange={onColorSchemeChange}
            onLanguageChange={onLanguageChange}
          />
        )}
        {activeTab === 'wallet' && (
          <WalletTab wallet={wallet} />
        )}
        {activeTab === 'providers' && (
          <ProvidersTab
            view={providersView}
            setView={setProvidersView}
            providers={providers}
            selectedProvider={selectedProvider}
            editingProvider={editingProvider}
            setEditingProvider={setEditingProvider}
            onSaveProvider={onSaveProvider}
            onDeleteProvider={onDeleteProvider}
            onSelectProvider={onSelectProvider}
          />
        )}
      </div>
    </div>
  )
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
]

function GeneralTab({
  colorScheme, language, onColorSchemeChange, onLanguageChange,
}: {
  colorScheme: ColorScheme
  language: Language
  onColorSchemeChange: (scheme: ColorScheme) => void
  onLanguageChange: (lang: Language) => void
}) {
  const { t } = useI18n()
  const [gatewayUrl, setGatewayUrl] = useState('http://127.0.0.1:18790')
  const [status, setStatus] = useState<OpenClawStatus>('idle')

  useEffect(() => {
    getOpenClawConfig().then((config) => {
      setGatewayUrl(config.gatewayUrl)
    })
  }, [])

  const testConnection = async (urlOverride?: string) => {
    const url = (urlOverride ?? gatewayUrl).trim()
    if (!url) {
      setStatus('disconnected')
      return false
    }

    setStatus('testing')
    try {
      await fetch(url, { method: 'GET' })
      setStatus('connected')
      return true
    } catch {
      setStatus('disconnected')
      return false
    }
  }

  const handleGatewayUrlChange = async (value: string) => {
    setGatewayUrl(value)
    await setOpenClawConfig({ gatewayUrl: value })
    setStatus('idle')
  }

  const COLOR_SCHEME_OPTIONS: { value: ColorScheme; label: string; icon: typeof Sun }[] = [
    { value: 'system', label: t('settings.system'), icon: Monitor },
    { value: 'light', label: t('settings.light'), icon: Sun },
    { value: 'dark', label: t('settings.dark'), icon: Moon },
  ]

  return (
    <div className="flex h-full flex-col px-8 pb-10">
      <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
        <h2 className="text-base font-semibold text-foreground">{t('settings.general')}</h2>
      </div>

      <div className="flex max-w-[640px] flex-col gap-8">
        <SettingsSection title={t('settings.appearance')}>
          <SettingsRow
            title={t('settings.colorScheme')}
            description={t('settings.colorSchemeDesc')}
          >
            <div className="flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-0.5">
              {COLOR_SCHEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => onColorSchemeChange(value)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                    colorScheme === value
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.language')}>
          <SettingsRow
            title={t('settings.displayLanguage')}
            description={t('settings.displayLanguageDesc')}
          >
            <SelectDropdown
              options={LANGUAGE_OPTIONS}
              value={language}
              onChange={onLanguageChange}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.openclaw')}>
          <SettingsRow
            title={t('settings.openclawGatewayUrl')}
            description={t('settings.openclawGatewayUrlDesc')}
          >
            <input
              type="text"
              value={gatewayUrl}
              onChange={(e) => void handleGatewayUrlChange(e.target.value)}
              className="w-[260px] rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary"
              placeholder="http://127.0.0.1:18790"
            />
          </SettingsRow>
          <SettingsRow
            title={t('settings.openclawConnectionStatus')}
            description={t('settings.openclawConnectionStatusDesc')}
          >
            <div className="flex items-center gap-3">
              <OpenClawStatusBadge status={status} />
              <button
                onClick={() => void testConnection()}
                className="cursor-pointer rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60"
              >
                {t('settings.openclawTestConnection')}
              </button>
            </div>
          </SettingsRow>
        </SettingsSection>
      </div>
    </div>
  )
}

function OpenClawStatusBadge({ status }: { status: OpenClawStatus }) {
  const { t } = useI18n()
  const color = status === 'connected'
    ? 'text-green-600 dark:text-green-400'
    : status === 'disconnected'
      ? 'text-red-600 dark:text-red-400'
      : 'text-muted-foreground'

  const label = status === 'connected'
    ? t('settings.openclawConnected')
    : status === 'disconnected'
      ? t('settings.openclawDisconnected')
      : status === 'testing'
        ? t('settings.openclawTesting')
        : t('settings.openclawNotTested')

  return (
    <span className={`flex items-center gap-1.5 text-xs ${color}`}>
      {status === 'testing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Circle className="h-3 w-3 fill-current" />}
      {label}
    </span>
  )
}

function ProvidersTab({
  view, setView, providers, selectedProvider, editingProvider, setEditingProvider,
  onSaveProvider, onDeleteProvider, onSelectProvider,
}: {
  view: ProvidersView
  setView: (v: ProvidersView) => void
  providers: LlmProvider[]
  selectedProvider: LlmProvider | null
  editingProvider: LlmProvider | null
  setEditingProvider: (p: LlmProvider | null) => void
  onSaveProvider: (provider: LlmProvider) => Promise<void>
  onDeleteProvider: (id: string) => Promise<void>
  onSelectProvider: (id: string) => Promise<void>
}) {
  const { t } = useI18n()

  if (view === 'add') {
    return (
      <div className="flex h-full flex-col px-8 pb-10">
        <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
          <button
            onClick={() => setView('list')}
            className="mb-3 flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('models.backToModels')}
          </button>
          <h2 className="text-base font-semibold text-foreground">{t('models.set')}</h2>
        </div>
        <div className="max-w-[640px]">
          <ProviderForm
            onSave={async (p) => { await onSaveProvider(p); setView('list') }}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    )
  }

  if (view === 'edit' && editingProvider) {
    return (
      <div className="flex h-full flex-col px-8 pb-10">
        <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
          <button
            onClick={() => setView('list')}
            className="mb-3 flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('models.backToModels')}
          </button>
          <h2 className="text-base font-semibold text-foreground">{t('models.edit')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{getTemplateByType(editingProvider.type)?.name ?? editingProvider.type}</p>
        </div>
        <div className="max-w-[640px]">
          <ProviderForm
            initial={editingProvider}
            onSave={async (p) => { await onSaveProvider(p); setView('list') }}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-8 pb-10">
      <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
        <h2 className="text-base font-semibold text-foreground">{t('models.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('models.description')}</p>
      </div>

      <div className="max-w-[640px] space-y-3">
        {providers.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('models.noModels')}
          </p>
        )}

        {providers.map(p => {
          const template = getTemplateByType(p.type)
          const model = template?.models.find(m => m.id === p.modelId)
          const isDefault = p.id === selectedProvider?.id

          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl border p-4 transition-colors ${
                isDefault
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/40 bg-card'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-sm font-semibold text-muted-foreground">
                  {(template?.name ?? p.type).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    <span className="rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {template?.name ?? p.type}
                    </span>
                    {isDefault && (
                      <span className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Star className="h-2.5 w-2.5" />
                        {t('common.default')}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {model?.name ?? p.modelId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!isDefault && (
                  <button
                    onClick={() => onSelectProvider(p.id)}
                    className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {t('models.setDefault')}
                  </button>
                )}
                <button
                  onClick={() => { setEditingProvider(p); setView('edit') }}
                  className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDeleteProvider(p.id)}
                  className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}

        <button
          onClick={() => setView('add')}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t('models.add')}
        </button>
      </div>
    </div>
  )
}

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="pb-2 text-sm font-medium text-foreground">{title}</h3>
      <div className="rounded-xl bg-muted/30 px-4">
        {children}
      </div>
    </div>
  )
}

export function SettingsRow({ title, description, children }: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/30 py-3.5 last:border-none">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SelectDropdown<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-sm transition-colors hover:bg-muted/60"
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        {current?.label}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-lg">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                value === opt.value ? 'font-medium text-primary' : 'text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
