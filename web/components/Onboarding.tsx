import { useI18n } from '@/lib/i18n/context'
import { setOnboardingComplete } from '@/lib/storage'

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useI18n()

  const handleComplete = async () => {
    await setOnboardingComplete()
    onComplete()
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {t('onboarding.title')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('onboarding.description')}
          </p>
        </div>

        {/* Gateway info */}
        <div className="rounded-2xl border border-border/50 bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Connect to the OpenClaw gateway to configure models and providers.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            You can configure the gateway URL in Settings after setup.
          </p>
        </div>

        {/* Continue */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleComplete}
            className="cursor-pointer rounded-xl bg-primary px-8 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            {t('common.continue') ?? 'Continue'}
          </button>
          <button
            onClick={handleComplete}
            className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('onboarding.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
