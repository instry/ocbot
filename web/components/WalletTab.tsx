import { useState } from 'react'
import { Copy, Check, RefreshCw, Lock, Unlock, Shield, AlertTriangle } from 'lucide-react'
import type { WalletActions, NetworkId } from '@/lib/wallet/types'
import { useI18n } from '@/lib/hooks/useI18n'
import { SettingsSection, SettingsRow } from './Settings'

const NETWORK_OPTIONS: { value: NetworkId; labelKey: string }[] = [
  { value: 'base-sepolia', labelKey: 'wallet.baseSepolia' },
  { value: 'base', labelKey: 'wallet.baseMainnet' },
]

export function WalletTab({ wallet }: { wallet: WalletActions }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'create' | 'import'>('create')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mnemonicInput, setMnemonicInput] = useState('')
  const [unlockPassword, setUnlockPassword] = useState('')
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null)
  const [pending, setPending] = useState<'create' | 'import' | 'unlock' | 'network' | 'refresh' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedMnemonic, setCopiedMnemonic] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const state = wallet.state

  const setErrorFrom = (e: unknown) => {
    const message = e instanceof Error && e.message ? e.message : t('walletTab.errorOperation')
    setError(message)
  }

  const copyText = async (text: string, target: 'address' | 'mnemonic') => {
    try {
      await navigator.clipboard.writeText(text)
      if (target === 'address') {
        setCopiedAddress(true)
        setTimeout(() => setCopiedAddress(false), 1400)
      } else {
        setCopiedMnemonic(true)
        setTimeout(() => setCopiedMnemonic(false), 1400)
      }
    } catch {
      setError(t('walletTab.errorCopy'))
    }
  }

  const handleCreate = async () => {
    if (!password || !confirmPassword) {
      setError(t('walletTab.errorPasswordRequired'))
      return
    }
    if (password.length < 8) {
      setError(t('walletTab.errorPasswordMin'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('walletTab.errorPasswordMismatch'))
      return
    }
    setError(null)
    setPending('create')
    try {
      const mnemonic = await wallet.createWallet(password)
      setCreatedMnemonic(mnemonic)
      setPassword('')
      setConfirmPassword('')
    } catch (e) {
      setErrorFrom(e)
    } finally {
      setPending(null)
    }
  }

  const handleImport = async () => {
    if (!mnemonicInput.trim() || !password || !confirmPassword) {
      setError(t('walletTab.errorMnemonicPasswordRequired'))
      return
    }
    if (password.length < 8) {
      setError(t('walletTab.errorPasswordMin'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('walletTab.errorPasswordMismatch'))
      return
    }
    setError(null)
    setPending('import')
    try {
      await wallet.importWallet(mnemonicInput.trim(), password)
      setMnemonicInput('')
      setPassword('')
      setConfirmPassword('')
    } catch (e) {
      setErrorFrom(e)
    } finally {
      setPending(null)
    }
  }

  const handleUnlock = async () => {
    if (!unlockPassword) {
      setError(t('walletTab.errorPasswordRequired'))
      return
    }
    setError(null)
    setPending('unlock')
    try {
      await wallet.unlock(unlockPassword)
      setUnlockPassword('')
    } catch (e) {
      setErrorFrom(e)
    } finally {
      setPending(null)
    }
  }

  const handleChangeNetwork = async (network: NetworkId) => {
    if (network === state.network) return
    setError(null)
    setPending('network')
    try {
      await wallet.setNetwork(network)
      if (state.status === 'unlocked') {
        await wallet.refreshBalances()
      }
    } catch (e) {
      setErrorFrom(e)
    } finally {
      setPending(null)
    }
  }

  const handleRefresh = async () => {
    setError(null)
    setPending('refresh')
    try {
      await wallet.refreshBalances()
    } catch (e) {
      setErrorFrom(e)
    } finally {
      setPending(null)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setError(null)
    setPending('delete')
    try {
      await wallet.deleteWallet()
      setCreatedMnemonic(null)
      setConfirmDelete(false)
      setMode('create')
    } catch (e) {
      setErrorFrom(e)
    } finally {
      setPending(null)
    }
  }

  const address = state.address
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null
  const isBusy = pending !== null

  return (
    <div className="flex h-full flex-col px-8 pb-10">
      <div className="sticky top-0 z-10 bg-background pt-6 pb-6">
        <h2 className="text-base font-semibold text-foreground">{t('wallet.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('walletTab.subtitle')}</p>
      </div>

      <div className="flex max-w-[640px] flex-col gap-6">
        <SettingsSection title={t('walletTab.statusSection')}>
          <SettingsRow
            title={t('walletTab.walletState')}
            description={
              state.status === 'none'
                ? t('walletTab.stateNoneDesc')
                : state.status === 'locked'
                  ? t('walletTab.stateLockedDesc')
                  : t('walletTab.stateUnlockedDesc')
            }
          >
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
              state.status === 'unlocked'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600'
                : state.status === 'locked'
                  ? 'border-amber-400/40 bg-amber-500/10 text-amber-600'
                  : 'border-border/50 bg-muted/40 text-muted-foreground'
            }`}>
              {state.status === 'unlocked' && <Unlock className="h-3 w-3" />}
              {state.status === 'locked' && <Lock className="h-3 w-3" />}
              {state.status === 'none' && <Shield className="h-3 w-3" />}
              {state.status === 'none' ? t('walletTab.stateNone') : state.status === 'locked' ? t('walletTab.stateLocked') : t('walletTab.stateUnlocked')}
            </span>
          </SettingsRow>

          <SettingsRow
            title={t('wallet.account')}
            description={address ? t('walletTab.addressDesc') : t('walletTab.addressMissingDesc')}
          >
            {address ? (
              <button
                onClick={() => void copyText(address, 'address')}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60"
              >
                <span>{shortAddress}</span>
                {copiedAddress ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">{t('walletTab.notAvailable')}</span>
            )}
          </SettingsRow>

          <SettingsRow
            title={t('wallet.network')}
            description={t('walletTab.networkDesc')}
          >
            <select
              value={state.network}
              onChange={(e) => { void handleChangeNetwork(e.target.value as NetworkId) }}
              className="cursor-pointer rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60"
            >
              {NETWORK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('wallet.balances')}>
          <SettingsRow
            title={t('wallet.eth')}
            description={t('walletTab.ethDesc')}
          >
            <span className="text-sm font-medium text-foreground">{state.balances.eth}</span>
          </SettingsRow>
          <SettingsRow
            title={t('wallet.usdc')}
            description={t('walletTab.usdcDesc')}
          >
            <span className="text-sm font-medium text-foreground">{state.balances.usdc}</span>
          </SettingsRow>
          <SettingsRow
            title={t('wallet.refreshBalances')}
            description={t('walletTab.refreshDesc')}
          >
            <button
              onClick={() => void handleRefresh()}
              disabled={state.status !== 'unlocked' || isBusy}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${pending === 'refresh' ? 'animate-spin' : ''}`} />
              {t('wallet.refreshBalances')}
            </button>
          </SettingsRow>
        </SettingsSection>

        {state.status === 'none' && (
          <SettingsSection title={t('walletTab.setupSection')}>
            <SettingsRow
              title={t('walletTab.mode')}
              description={t('walletTab.modeDesc')}
            >
              <div className="flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-0.5">
                <button
                  onClick={() => setMode('create')}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-xs transition-colors ${
                    mode === 'create' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {t('wallet.createTitle')}
                </button>
                <button
                  onClick={() => setMode('import')}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-xs transition-colors ${
                    mode === 'import' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {t('wallet.importTitle')}
                </button>
              </div>
            </SettingsRow>

            {mode === 'import' && (
              <SettingsRow
                title={t('wallet.mnemonic')}
                description={t('walletTab.mnemonicDesc')}
              >
                <textarea
                  value={mnemonicInput}
                  onChange={(e) => setMnemonicInput(e.target.value)}
                  rows={3}
                  className="w-[320px] rounded-lg border border-border/50 bg-background px-3 py-2 text-xs outline-none focus:border-primary/50"
                  placeholder="word1 word2 ... word12"
                />
              </SettingsRow>
            )}

            <SettingsRow
              title={t('wallet.password')}
              description={t('walletTab.passwordDesc')}
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-[220px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs outline-none focus:border-primary/50"
                placeholder={t('walletTab.passwordPlaceholder')}
              />
            </SettingsRow>

            <SettingsRow
              title={t('wallet.confirmPassword')}
              description={t('walletTab.confirmPasswordDesc')}
            >
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-[220px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs outline-none focus:border-primary/50"
                placeholder={t('walletTab.confirmPasswordPlaceholder')}
              />
            </SettingsRow>

            <SettingsRow
              title={t('walletTab.action')}
              description={mode === 'create' ? t('walletTab.createActionDesc') : t('walletTab.importActionDesc')}
            >
              <button
                onClick={() => { void (mode === 'create' ? handleCreate() : handleImport()) }}
                disabled={isBusy}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === 'create' || pending === 'import' ? t('walletTab.processing') : mode === 'create' ? t('wallet.createButton') : t('wallet.importButton')}
              </button>
            </SettingsRow>
          </SettingsSection>
        )}

        {createdMnemonic && (
          <SettingsSection title={t('wallet.backupTitle')}>
            <SettingsRow
              title={t('wallet.mnemonic')}
              description={t('walletTab.backupDesc')}
            >
              <div className="flex max-w-[360px] items-start gap-2">
                <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700">{createdMnemonic}</p>
                <button
                  onClick={() => void copyText(createdMnemonic, 'mnemonic')}
                  className="rounded-lg border border-border/50 bg-muted/30 p-2 transition-colors hover:bg-muted/60"
                >
                  {copiedMnemonic ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
            </SettingsRow>
          </SettingsSection>
        )}

        {state.status === 'locked' && (
          <SettingsSection title={t('wallet.unlockButton')}>
            <SettingsRow
              title={t('wallet.password')}
              description={t('walletTab.unlockPasswordDesc')}
            >
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                className="w-[220px] rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs outline-none focus:border-primary/50"
                placeholder={t('walletTab.unlockPasswordPlaceholder')}
              />
            </SettingsRow>
            <SettingsRow
              title={t('walletTab.action')}
              description={t('walletTab.unlockActionDesc')}
            >
              <button
                onClick={() => void handleUnlock()}
                disabled={isBusy}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === 'unlock' ? t('walletTab.unlocking') : t('wallet.unlockButton')}
              </button>
            </SettingsRow>
          </SettingsSection>
        )}

        {state.status === 'unlocked' && (
          <SettingsSection title={t('wallet.security')}>
            <SettingsRow
              title={t('wallet.lockButton')}
              description={t('walletTab.lockDesc')}
            >
              <button
                onClick={() => wallet.lock()}
                disabled={isBusy}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5" />
                {t('wallet.lockButton')}
              </button>
            </SettingsRow>
          </SettingsSection>
        )}

        {state.status !== 'none' && (
          <SettingsSection title={t('walletTab.dangerSection')}>
            <SettingsRow
              title={t('wallet.deleteButton')}
              description={t('walletTab.deleteDesc')}
            >
              <button
                onClick={() => void handleDelete()}
                disabled={isBusy}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  confirmDelete
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {pending === 'delete' ? t('walletTab.deleting') : confirmDelete ? t('walletTab.deleteConfirmClick') : t('wallet.deleteButton')}
              </button>
            </SettingsRow>
          </SettingsSection>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
