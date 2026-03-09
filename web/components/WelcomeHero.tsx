import { BotAvatar } from '@/components/BotAvatar'

export function WelcomeHero({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* <div className="ring-4 ring-primary/10 rounded-full">
        <BotAvatar size="lg" />
      </div> */}
      <h1 className={`font-semibold text-foreground ${size === 'lg' ? 'text-3xl' : 'text-lg'}`}>
        How can I help?
      </h1>
    </div>
  )
}
