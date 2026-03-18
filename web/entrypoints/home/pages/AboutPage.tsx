import { BotAvatar } from '@/components/BotAvatar'
import { MessageCircleQuestion, Globe, Mail } from 'lucide-react'
import { useI18n } from '@/lib/i18n/context'

const FAQ_KEYS = [
  { qKey: 'about.faq1q', aKey: 'about.faq1a' },
  { qKey: 'about.faq2q', aKey: 'about.faq2a' },
  { qKey: 'about.faq3q', aKey: 'about.faq3a' },
  { qKey: 'about.faq4q', aKey: 'about.faq4a' },
  { qKey: 'about.faq5q', aKey: 'about.faq5a' },
]

const SOCIALS = [
  { name: 'X', url: 'https://x.com/ocbot_ai' },
  { name: 'Instagram', url: 'https://instagram.com/ocbot_ai' },
  { name: 'YouTube', url: 'https://youtube.com/@ocbot_ai' },
  { name: 'Discord', url: 'https://discord.gg/ocbot_ai' },
  { name: 'TikTok', url: 'https://tiktok.com/@ocbot_ai' },
]

export function AboutPage() {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <BotAvatar size="lg" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('app.name')}</h1>
          <p className="text-center text-sm italic text-muted-foreground">
            {t('app.tagline')}
          </p>
        </div>

        {/* Nicknames */}
        <div className="mt-8 rounded-xl border border-border/40 bg-card p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('about.intro')}
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-8">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{t('about.faq')}</h2>
          </div>
          <div className="mt-3 space-y-3">
            {FAQ_KEYS.map(({ qKey, aKey }) => (
              <div key={qKey} className="rounded-xl border border-border/40 bg-card p-4">
                <p className="text-sm font-medium text-foreground">Q: {t(qKey)}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{t(aKey)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Contact & Socials */}
        <div className="mt-8 flex flex-col items-center gap-3 pb-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href="https://oc.bot" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Globe className="h-3.5 w-3.5" />
              oc.bot
            </a>
            <a href="mailto:hi@oc.bot" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Mail className="h-3.5 w-3.5" />
              hi@oc.bot
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {SOCIALS.map(({ name, url }) => (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {name}
              </a>
            ))}
          </div>
          <span className="mt-1 text-xs text-muted-foreground/50">v{__OCBOT_VERSION__}</span>
        </div>
      </div>
    </div>
  )
}
