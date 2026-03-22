import { useState } from 'react'
import { ProviderForm } from '@/components/ProviderForm'
import { useI18n } from '@/lib/i18n/context'
import {
  setOnboardingComplete,
  saveProvider,
  setDefaultProviderId,
  getOpenClawConfig,
} from '@/lib/storage'
import { getProviderFamily } from '@/lib/llm/types'
import { getTemplateByType } from '@/lib/llm/models'
import type { LlmProvider } from '@/lib/llm/types'

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

/** Send a JSON-RPC-style request to the OpenClaw gateway over WebSocket. */
async function gatewayRequest(
  gatewayUrl: string,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const wsUrl = gatewayUrl.replace(/^http/, 'ws')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const id = crypto.randomUUID()
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('gateway request timed out'))
    }, 10_000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'req', id, method, params }))
    }
    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data)
        if (frame.type === 'res' && frame.id === id) {
          clearTimeout(timeout)
          ws.close()
          if (frame.ok) {
            resolve(frame.payload)
          } else {
            reject(new Error(frame.error?.message ?? 'gateway error'))
          }
        }
      } catch { /* ignore non-JSON frames */ }
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('gateway connection failed'))
    }
  })
}

/** Build an openclaw.json merge-patch for the given provider. */
function buildProviderPatch(provider: LlmProvider) {
  const template = getTemplateByType(provider.type)
  const model = template?.models.find((m) => m.id === provider.modelId)
  const apiFormat = getApiFormat(provider.type)
  const baseUrl = provider.baseUrl || template?.defaultBaseUrl || ''
  const modelName = model?.name || provider.modelId
  const contextWindow = model?.contextWindow || 128000
  const maxTokens = model?.contextWindow
    ? Math.min(model.contextWindow, 8192)
    : 8192

  return {
    models: {
      mode: 'merge',
      providers: {
        [provider.type]: {
          baseUrl,
          api: apiFormat,
          authHeader: `Bearer {{auth:${provider.type}:default}}`,
          models: [
            {
              id: provider.modelId,
              name: modelName,
              contextWindow,
              maxTokens,
            },
          ],
        },
      },
    },
    auth: {
      profiles: {
        [`${provider.type}:default`]: {
          provider: provider.type,
          mode: 'api_key',
          apiKey: provider.apiKey,
        },
      },
    },
    agents: {
      defaults: {
        model: {
          primary: `${provider.type}/${provider.modelId}`,
        },
      },
    },
  }
}

interface OnboardingProps {
  onComplete: () => void
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

      // 2. Write to openclaw.json via gateway WebSocket config.patch
      try {
        const { gatewayUrl } = await getOpenClawConfig()

        // First get current config to obtain baseHash
        const getResult = (await gatewayRequest(gatewayUrl, 'config.get')) as {
          hash?: string
        }
        const baseHash = getResult?.hash

        // Patch the config with provider settings
        const patch = buildProviderPatch(provider)
        await gatewayRequest(gatewayUrl, 'config.patch', {
          baseHash,
          raw: JSON.stringify(patch),
        })
      } catch {
        // Gateway may not be running yet — that's OK for onboarding.
        // The provider is saved in chrome.storage and will sync later.
        console.warn('Failed to patch openclaw config via gateway, skipping')
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
