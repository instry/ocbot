import { useState } from 'react'
import { Sliders, Info, Sun, Moon, Globe, Mail } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import type { ThemeMode } from '@/stores/ui-store'
import { SelectionGroup } from '@/components/ui/selection-group'

type SettingsTab = 'general' | 'about'

export function SettingsRoute() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const { themeMode, setThemeMode } = useUIStore()

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="w-48 border-r border-border bg-bg-subtle flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-strong">Settings</h2>
        </div>
        <nav className="flex-1 p-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === 'general'
                ? 'bg-accent/10 text-accent'
                : 'text-text hover:bg-bg-hover'
            }`}
          >
            <Sliders className="h-4 w-4" />
            General
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              activeTab === 'about'
                ? 'bg-accent/10 text-accent'
                : 'text-text hover:bg-bg-hover'
            }`}
          >
            <Info className="h-4 w-4" />
            About
          </button>
        </nav>
      </div>

      {/* Content */}
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
    <div className="p-6 max-w-3xl">
      <h2 className="text-xl font-semibold text-text-strong mb-6">General</h2>

      <div className="space-y-6">
        {/* Appearance */}
        <div>
          <h3 className="text-sm font-medium text-text-strong mb-3">Appearance</h3>
          <div className="bg-bg-subtle border border-border rounded-lg p-4">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-text-strong">Color Scheme</div>
                <div className="text-xs text-muted-foreground mt-0.5">Choose your preferred theme</div>
              </div>
              <SelectionGroup
                value={themeMode}
                options={appearanceOptions}
                onChange={setThemeMode}
                size="compact"
              />
            </div>
          </div>
        </div>
      </div>
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

  // const socials = [
  //   { name: 'X', url: 'https://x.com/ocbot_ai' },
  //   { name: 'Instagram', url: 'https://instagram.com/ocbot_ai' },
  //   { name: 'YouTube', url: 'https://youtube.com/@ocbot_ai' },
  //   { name: 'Discord', url: 'https://discord.gg/ocbot_ai' },
  //   { name: 'TikTok', url: 'https://tiktok.com/@ocbot_ai' },
  // ]

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex flex-col items-center text-center mb-8">
        <img src="./logo.png" alt="Ocbot" className="w-16 h-16 mb-4" />
        <h1 className="text-2xl font-bold text-text-strong mb-2">ocbot</h1>
        <p className="text-sm text-muted-foreground">Got brains, got arms, up before the alarm.</p>
      </div>

      <div className="bg-bg-subtle border border-border rounded-lg p-4 mb-6">
        <p className="text-sm text-text leading-relaxed">
          My name is ocbot. I'm super smart and super quick at getting things done.
          I live inside your browser with eight nimble arms ready to handle any task.
          Ask me to find info, fill forms, compare products, or automate your online work.
          I don't sleep, I don't forget, and I'm always ready.
        </p>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-strong mb-3">FAQ</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-bg-subtle border border-border rounded-lg p-4">
              <p className="text-sm font-medium text-text-strong mb-1">Q: {f.q}</p>
              <p className="text-sm text-text">{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 pt-4 border-t border-border">
        <div className="flex gap-4 text-sm">
          <a href="https://oc.bot" target="_blank" rel="noopener" className="flex items-center gap-1.5 text-accent hover:text-accent/80 transition-colors no-underline">
            <Globe className="h-3.5 w-3.5" />
            oc.bot
          </a>
          <a href="mailto:hi@oc.bot" className="flex items-center gap-1.5 text-accent hover:text-accent/80 transition-colors no-underline">
            <Mail className="h-3.5 w-3.5" />
            hi@oc.bot
          </a>
        </div>
        {/* <div className="flex flex-wrap gap-2 justify-center">
          {socials.map(s => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener"
              className="px-3 py-1 text-xs bg-bg-subtle border border-border rounded-full text-text hover:bg-bg-hover transition-colors"
            >
              {s.name}
            </a>
          ))}
        </div> */}
        <div className="text-xs text-muted-foreground">v{version}</div>
      </div>
    </div>
  )
}
