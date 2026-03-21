import { useState } from 'react'
import { ProviderForm } from '@/components/ProviderForm'
import { useI18n } from '@/lib/i18n/context'
import { setOnboardingComplete, saveProvider, setDefaultProviderId } from '@/lib/storage'
import { getProviderFamily } from '@/lib/llm/types'
import { getTemplateByType } from '@/lib/llm/models'
import type { LlmProvider } from '@/lib/llm/types'

interface OnboardingProps {
  onComplete: () => void
}

function getApiFormat(type: string): string {
  const family = getProviderFamily(type as any)
  switch (family) {
    case 'anthropic':
      return 'anthropic-messages'
    case 'google':
      return 'google-genai'
    default:
      return 'openai-chat'
  }
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)

  const handleSave = async (provider: LlmProvider) => {
    setSaving(true)
    try {
      // 1. Save to chrome.storage (extension provider list)
      await saveProvider(provider)
      await setDefaultProviderId(provider.id)

      // 2. Write to openclaw.json via chrome.ocbot API
      if (chrome.ocbot?.setProvider) {
        const template = getTemplateByType(provider.type)
        const model = template?.models.find(m => m.id === provider.modelId)

        await new Promise<void>((resolve) => {
          chrome.ocbot.setProvider(
            {
              providerId: provider.type,
              baseUrl: provider.baseUrl || template?.defaultBaseUrl || '',
              apiFormat: getApiFormat(provider.type),
              apiKey: provider.apiKey,
              modelId: provider.modelId,
              modelName: model?.name || provider.modelId,
              contextWindow: model?.contextWindow || 128000,
              maxTokens: model?.contextWindow ? Math.min(model.contextWindow, 8192) : 8192,
            },
            () => resolve(),
          )
        })
      }

      // 3. Mark onboarding complete
      await setOnboardingComplete()
      onComplete()
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
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

        {/* Provider Form */}
        <div className="rounded-2xl border border-border/50 bg-card p-6">
          <ProviderForm
            onSave={handleSave}
            onCancel={handleSkip}
            hideCancel
            compact
          />
        </div>

        {/* Skip */}
        <div className="text-center">
          <button
            onClick={handleSkip}
            disabled={saving}
            className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('onboarding.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
