// lib/storage-backend.ts — Storage abstraction layer

export type StorageChangeListener = (
  changes: { [key: string]: { oldValue?: any; newValue?: any } },
) => void

export interface StorageBackend {
  get(key: string): Promise<Record<string, any>>
  set(data: Record<string, any>): Promise<void>
  remove(key: string): Promise<void>
  onChanged(listener: StorageChangeListener): () => void
}

class ChromeStorageBackend implements StorageBackend {
  async get(key: string): Promise<Record<string, any>> {
    return chrome.storage.local.get(key)
  }

  async set(data: Record<string, any>): Promise<void> {
    await chrome.storage.local.set(data)
  }

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key)
  }

  onChanged(listener: StorageChangeListener): () => void {
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }
}

let storage: StorageBackend = new ChromeStorageBackend()

export function setStorageBackend(backend: StorageBackend): void {
  storage = backend
}

export { storage }
