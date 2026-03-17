import { BotAvatar } from '@/components/BotAvatar'
import { useI18n } from '@/lib/i18n/context'

export function WelcomeHero({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center gap-3">
      {/* <div className="ring-4 ring-primary/10 rounded-full">
        <BotAvatar size="lg" />
      </div> */}
      <h1 className={`font-semibold text-foreground ${size === 'lg' ? 'text-3xl' : 'text-lg'}`}>
        {t('chat.welcome')}
      </h1>
    </div>
  )
}
