import { storage } from '../storage-backend'
import type { KeyStore, WalletSettings, NetworkId } from './types'

const KEYS = {
  keystore: 'ocbot_wallet_keystore',
  settings: 'ocbot_wallet_settings',
} as const

const DEFAULT_SETTINGS: WalletSettings = {
  network: 'base-sepolia',
}

export async function getKeyStore(): Promise<KeyStore | null> {
  const result = await storage.get(KEYS.keystore)
  return (result[KEYS.keystore] as KeyStore) ?? null
}

export async function saveKeyStore(keystore: KeyStore): Promise<void> {
  await storage.set({ [KEYS.keystore]: keystore })
}

export async function deleteKeyStore(): Promise<void> {
  await storage.remove(KEYS.keystore)
}

export async function getWalletSettings(): Promise<WalletSettings> {
  const result = await storage.get(KEYS.settings)
  return (result[KEYS.settings] as WalletSettings) ?? DEFAULT_SETTINGS
}

export async function saveWalletSettings(settings: WalletSettings): Promise<void> {
  await storage.set({ [KEYS.settings]: settings })
}

export { KEYS as WALLET_STORAGE_KEYS }
