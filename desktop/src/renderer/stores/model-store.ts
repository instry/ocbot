import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GatewayModel } from '@/types/chat'

// CN region base URLs keyed by provider
const CN_URLS: Record<string, string> = {
  minimax: 'https://api.minimaxi.com',
  zai: 'https://open.bigmodel.cn',
  moonshot: 'https://api.moonshot.cn',
  qwen: 'https://dashscope.aliyuncs.com',
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  qwen: 'Qwen',
  moonshot: 'Kimi / Moonshot',
  minimax: 'MiniMax',
  ollama: 'Ollama',
  zai: 'Zhipu Z-AI',
}

interface ModelStore {
  models: GatewayModel[]
  selectedModel: string  // provider/id format
  cnProviders: Set<string>
  isLoading: boolean

  setModels: (models: GatewayModel[]) => void
  selectModel: (key: string) => void
  setLoading: (loading: boolean) => void
  setCnProviders: (cn: Set<string>) => void
  getDisplayName: (model: GatewayModel) => string
  getSelectedDisplay: () => string
  getProviderLabel: (provider: string) => string
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set, get) => ({
      models: [],
      selectedModel: '',
      cnProviders: new Set(),
      isLoading: false,

      setModels: (models) => set({ models, isLoading: false }),
      selectModel: (key) => set({ selectedModel: key }),
      setLoading: (loading) => set({ isLoading: loading }),
      setCnProviders: (cn) => set({ cnProviders: cn }),

      getDisplayName: (model) => {
        const name = model.name || model.id
        return get().cnProviders.has(model.provider) ? `${name}-CN` : name
      },

      getSelectedDisplay: () => {
        const { selectedModel, models } = get()
        if (!selectedModel) return 'Select model'
        const m = models.find(m => `${m.provider}/${m.id}` === selectedModel)
        return m ? get().getDisplayName(m) : selectedModel.split('/').pop() ?? selectedModel
      },

      getProviderLabel: (provider) => PROVIDER_LABELS[provider] ?? provider,
    }),
    {
      name: 'ocbot-model-preference',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
      }),
    }
  )
)

export { CN_URLS, PROVIDER_LABELS }
