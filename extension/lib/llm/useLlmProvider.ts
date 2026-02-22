import { useState, useEffect, useCallback } from 'react'
import type { LlmProvider } from './types'
import { getProviders, saveProvider as storageSave, deleteProvider as storageDelete, getDefaultProviderId, setDefaultProviderId } from '../storage'

export function useLlmProvider() {
  const [providers, setProviders] = useState<LlmProvider[]>([])
  const [defaultId, setDefaultId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, id] = await Promise.all([getProviders(), getDefaultProviderId()])
    setProviders(p)
    setDefaultId(id)
  }, [])

  useEffect(() => {
    load()

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes['ocbot_providers'] || changes['ocbot_default_provider_id']) {
        load()
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [load])

  const selectedProvider = providers.find(p => p.id === defaultId) ?? providers[0] ?? null

  const saveProviderFn = useCallback(async (provider: LlmProvider) => {
    await storageSave(provider)
    // If first provider, auto-set as default
    const all = await getProviders()
    if (all.length === 1) {
      await setDefaultProviderId(provider.id)
    }
  }, [])

  const deleteProviderFn = useCallback(async (id: string) => {
    await storageDelete(id)
  }, [])

  const selectProvider = useCallback(async (id: string) => {
    await setDefaultProviderId(id)
  }, [])

  return {
    providers,
    selectedProvider,
    saveProvider: saveProviderFn,
    deleteProvider: deleteProviderFn,
    selectProvider,
  }
}
