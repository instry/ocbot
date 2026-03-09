// lib/hooks/useAuth.ts — Offline stub (cloud auth removed)

import { useCallback } from 'react'

export function useAuth() {
  const noop = useCallback(async () => {}, [])
  const noopWithArgs = useCallback(async (_a: string, _b: string) => {}, [])

  return {
    user: null,
    session: null,
    loading: false,
    isAuthenticated: false,
    signInWithEmail: noopWithArgs,
    signUpWithEmail: noopWithArgs,
    signInWithGoogle: noop,
    signOut: noop,
  }
}
