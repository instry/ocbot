import { useState, useEffect, useCallback, useRef } from 'react'
import { storage } from '../storage-backend'
import {
  generateNewMnemonic,
  deriveFromMnemonic,
  encryptPrivateKey,
  decryptPrivateKey,
  getKeyStore,
  saveKeyStore,
  deleteKeyStore,
  getWalletSettings,
  saveWalletSettings,
  fetchBalances,
} from '../wallet'
import type { WalletState, WalletActions, NetworkId, KeyStore } from '../wallet'

const KEYSTORE_KEY = 'ocbot_wallet_keystore'
const SETTINGS_KEY = 'ocbot_wallet_settings'

const INITIAL_STATE: WalletState = {
  status: 'none',
  address: null,
  network: 'base-sepolia',
  balances: { eth: '0', usdc: '0' },
}

export function useWallet(): WalletActions {
  const [state, setState] = useState<WalletState>(INITIAL_STATE)
  const privateKeyRef = useRef<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load keystore + settings on mount
  useEffect(() => {
    async function load() {
      const [keystore, settings] = await Promise.all([getKeyStore(), getWalletSettings()])
      const network = settings.network
      if (keystore) {
        setState(prev => ({ ...prev, status: 'locked', address: keystore.address, network }))
      } else {
        setState(prev => ({ ...prev, status: 'none', network }))
      }
    }
    load()
  }, [])

  // Listen for storage changes from other contexts
  useEffect(() => {
    const unsubscribe = storage.onChanged((changes) => {
      if (changes[KEYSTORE_KEY]) {
        const ks = changes[KEYSTORE_KEY].newValue as KeyStore | undefined
        if (ks) {
          setState(prev => ({ ...prev, status: 'locked', address: ks.address }))
          privateKeyRef.current = null
        } else {
          setState(prev => ({ ...prev, status: 'none', address: null, balances: { eth: '0', usdc: '0' } }))
          privateKeyRef.current = null
        }
      }
      if (changes[SETTINGS_KEY]?.newValue) {
        setState(prev => ({ ...prev, network: changes[SETTINGS_KEY].newValue.network }))
      }
    })
    return unsubscribe
  }, [])

  // Balance polling when unlocked
  useEffect(() => {
    if (state.status !== 'unlocked' || !state.address) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }

    const poll = async () => {
      try {
        const balances = await fetchBalances(state.address as `0x${string}`, state.network)
        setState(prev => ({ ...prev, balances }))
      } catch {
        // Silently fail — network may be unreachable
      }
    }

    poll()
    pollingRef.current = setInterval(poll, 30_000)
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [state.status, state.address, state.network])

  const createWallet = useCallback(async (password: string): Promise<string> => {
    const mnemonic = generateNewMnemonic()
    const { privateKey, address } = deriveFromMnemonic(mnemonic)
    const encrypted = await encryptPrivateKey(privateKey, password)

    const keystore: KeyStore = {
      version: 1,
      address,
      encryptedKey: encrypted.ciphertext,
      salt: encrypted.salt,
      iv: encrypted.iv,
      createdAt: Date.now(),
    }

    await saveKeyStore(keystore)
    privateKeyRef.current = privateKey
    setState(prev => ({ ...prev, status: 'unlocked', address }))
    return mnemonic
  }, [])

  const importWallet = useCallback(async (mnemonic: string, password: string): Promise<void> => {
    const { privateKey, address } = deriveFromMnemonic(mnemonic)
    const encrypted = await encryptPrivateKey(privateKey, password)

    const keystore: KeyStore = {
      version: 1,
      address,
      encryptedKey: encrypted.ciphertext,
      salt: encrypted.salt,
      iv: encrypted.iv,
      createdAt: Date.now(),
    }

    await saveKeyStore(keystore)
    privateKeyRef.current = privateKey
    setState(prev => ({ ...prev, status: 'unlocked', address }))
  }, [])

  const unlock = useCallback(async (password: string): Promise<void> => {
    const keystore = await getKeyStore()
    if (!keystore) throw new Error('No wallet found')

    const privateKey = await decryptPrivateKey(
      keystore.encryptedKey,
      keystore.salt,
      keystore.iv,
      password,
    )

    privateKeyRef.current = privateKey
    setState(prev => ({ ...prev, status: 'unlocked' }))
  }, [])

  const lock = useCallback(() => {
    privateKeyRef.current = null
    setState(prev => ({ ...prev, status: 'locked', balances: { eth: '0', usdc: '0' } }))
  }, [])

  const deleteWallet = useCallback(async () => {
    privateKeyRef.current = null
    await deleteKeyStore()
    setState(prev => ({ ...prev, status: 'none', address: null, balances: { eth: '0', usdc: '0' } }))
  }, [])

  const setNetwork = useCallback(async (network: NetworkId) => {
    await saveWalletSettings({ network })
    setState(prev => ({ ...prev, network, balances: { eth: '0', usdc: '0' } }))
  }, [])

  const refreshBalances = useCallback(async () => {
    if (state.status !== 'unlocked' || !state.address) return
    try {
      const balances = await fetchBalances(state.address as `0x${string}`, state.network)
      setState(prev => ({ ...prev, balances }))
    } catch {
      // Silently fail
    }
  }, [state.status, state.address, state.network])

  const getAddress = useCallback(() => state.address, [state.address])

  return {
    state,
    createWallet,
    importWallet,
    unlock,
    lock,
    deleteWallet,
    setNetwork,
    refreshBalances,
    getAddress,
  }
}
