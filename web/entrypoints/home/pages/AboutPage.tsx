import { BotAvatar } from '@/components/BotAvatar'
import { MessageCircleQuestion, Globe, Mail } from 'lucide-react'

const FAQ = [
  {
    q: 'What are you exactly?',
    a: "I'm a new species! I'm a browser and an AI assistant. My main mission is to help you get stuff done.",
  },
  {
    q: 'Why the name "ocbot"?',
    a: 'Because "octo" means 8! So oc-bot = an 8-armed robot~ Fits me perfectly, right?',
  },
  {
    q: 'Why purple?',
    a: "Because I'm hitting the big time(大红大紫). (and well, it's the AI color~)",
  },
  {
    q: 'Your avatar only has 5 arms.',
    a: 'The other 3 are hidden behind me, duh.',
  },
  {
    q: 'Will you leak my data?',
    a: 'Nope! All your data is stored locally on your machine.',
  },
]

const SOCIALS = [
  { name: 'X', url: 'https://x.com/ocbot_ai' },
  { name: 'Instagram', url: 'https://instagram.com/ocbot_ai' },
  { name: 'YouTube', url: 'https://youtube.com/@ocbot_ai' },
  { name: 'Discord', url: 'https://discord.gg/ocbot_ai' },
  { name: 'TikTok', url: 'https://tiktok.com/@ocbot_ai' },
]

export function AboutPage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <BotAvatar size="lg" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">ocbot</h1>
          <p className="text-center text-sm italic text-muted-foreground">
            Got brains, got arms, up before the alarm.
          </p>
        </div>

        {/* Nicknames */}
        <div className="mt-8 rounded-xl border border-border/40 bg-card p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            My name is ocbot. I'm super smart and super quick at getting things done(because I have 8 brains and 8 arms 😄).
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-8">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">FAQ</h2>
          </div>
          <div className="mt-3 space-y-3">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-border/40 bg-card p-4">
                <p className="text-sm font-medium text-foreground">Q: {q}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{a}</p>
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
          <span className="mt-1 text-xs text-muted-foreground/50">v0.1.0</span>
        </div>
      </div>
    </div>
  )
}
