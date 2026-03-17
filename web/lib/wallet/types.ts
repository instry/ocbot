export interface KeyStore {
  version: number
  address: string
  encryptedKey: string
  salt: string
  iv: string
  createdAt: number
}

export type NetworkId = 'base' | 'base-sepolia'

export interface WalletSettings {
  network: NetworkId
}

export type WalletStatus = 'locked' | 'unlocked' | 'none'

export interface WalletState {
  status: WalletStatus
  address: string | null
  network: NetworkId
  balances: { eth: string; usdc: string }
}

export interface WalletActions {
  state: WalletState
  createWallet: (password: string) => Promise<string>
  importWallet: (mnemonic: string, password: string) => Promise<void>
  unlock: (password: string) => Promise<void>
  lock: () => void
  deleteWallet: () => Promise<void>
  setNetwork: (network: NetworkId) => Promise<void>
  refreshBalances: () => Promise<void>
  getAddress: () => string | null
}
