// lib/hooks/useSkillSync.ts — Stubbed out (cloud sync removed)

export function useSkillSync() {
  return {
    syncStatus: 'idle' as const,
    lastSyncAt: null as number | null,
    triggerSync: () => {},
  }
}
