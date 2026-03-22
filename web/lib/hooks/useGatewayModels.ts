import { useState, useEffect, useCallback } from 'react'
import { getOpenClawConfig, getSelectedModel, setSelectedModel } from '@/lib/storage'
import { listModels, type GatewayModel } from '@/lib/gateway/models'

export function useGatewayModels() {
  const [gatewayUrl, setGatewayUrl] = useState('http://127.0.0.1:18789')
  const [models, setModels] = useState<GatewayModel[]>([])
  const [selectedModel, setSelectedModelState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load gateway URL and selected model from storage
  useEffect(() => {
    Promise.all([getOpenClawConfig(), getSelectedModel()]).then(
      ([config, model]) => {
        setGatewayUrl(config.gatewayUrl)
        setSelectedModelState(model)
      },
    )
  }, [])

  // Fetch models from gateway
  const refreshModels = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listModels(gatewayUrl)
      setModels(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }, [gatewayUrl])

  useEffect(() => {
    refreshModels()
  }, [refreshModels])

  const selectModel = useCallback(
    async (model: string | null) => {
      setSelectedModelState(model)
      await setSelectedModel(model)
    },
    [],
  )

  return {
    gatewayUrl,
    models,
    selectedModel,
    selectModel,
    loading,
    error,
    refreshModels,
  }
}
