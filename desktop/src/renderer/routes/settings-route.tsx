import { useState } from 'react'
import { Sliders, Info, Sun, Moon, Globe, Mail } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SelectionGroup } from '@/components/ui/selection-group'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import type { ThemeMode } from '@/stores/ui-store'

type SettingsTab = 'general' | 'about'

export function SettingsRoute() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const { themeMode, setThemeMode } = useUIStore()
  const tabs = [
    { value: 'general' as const, label: 'General', icon: Sliders },
    { value: 'about' as const, label: 'About', icon: Info },
  ]

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-56 flex-col border-r border-border bg-bg-subtle/80 p-3">
        <div className="px-2 py-2">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Workspace</div>
          <h2 className="mt-1 text-base font-semibold text-text-strong">Settings</h2>
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
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}

function GeneralTab({ themeMode, setThemeMode }: { themeMode: ThemeMode; setThemeMode: (mode: ThemeMode) => void }) {
  const appearanceOptions = [
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-text-strong">General</h2>
        <p className="text-sm text-muted-foreground">管理桌面端的外观和基础体验。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose your preferred theme.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-text-strong">Color Scheme</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Switch between light and dark mode.</div>
            </div>
            <SelectionGroup
              value={themeMode}
              options={appearanceOptions}
              onChange={setThemeMode}
              size="compact"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AboutTab() {
  const version = '0.1.0'

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

      <Card className="shadow-none">
        <CardContent className="flex flex-col items-center gap-4 p-5">
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

      <div className="flex justify-center">
        <Badge variant="accent">v{version}</Badge>
      </div>
    </div>
  )
}
