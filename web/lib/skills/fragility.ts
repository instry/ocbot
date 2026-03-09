// lib/skills/fragility.ts — Per-step fragility analysis
import type { SkillExecution } from './types'

export interface StepFragility {
  stepIndex: number
  healCount: number
  totalExecutions: number
  healFrequency: number
  avgHealLevel: number
  fragile: boolean
}

/**
 * Compute per-step fragility from execution history.
 * A step is "fragile" if it requires healing more than 50% of the time.
 */
export function computeStepFragility(
  executions: SkillExecution[],
  totalSteps: number,
): StepFragility[] {
  if (executions.length === 0 || totalSteps === 0) return []

  // Build per-step heal stats
  const stepStats = new Map<number, { healCount: number; healLevels: number[] }>()

  for (const exec of executions) {
    for (const event of exec.healEvents) {
      if (!stepStats.has(event.stepIndex)) {
        stepStats.set(event.stepIndex, { healCount: 0, healLevels: [] })
      }
      const stat = stepStats.get(event.stepIndex)!
      if (event.resolved) {
        stat.healCount++
        stat.healLevels.push(event.level)
      }
    }
  }

  const total = executions.length
  const result: StepFragility[] = []

  for (let i = 0; i < totalSteps; i++) {
    const stat = stepStats.get(i)
    if (!stat) {
      result.push({
        stepIndex: i,
        healCount: 0,
        totalExecutions: total,
        healFrequency: 0,
        avgHealLevel: 0,
        fragile: false,
      })
      continue
    }

    const healFrequency = stat.healCount / total
    const avgHealLevel = stat.healLevels.length > 0
      ? stat.healLevels.reduce((a, b) => a + b, 0) / stat.healLevels.length
      : 0

    result.push({
      stepIndex: i,
      healCount: stat.healCount,
      totalExecutions: total,
      healFrequency,
      avgHealLevel,
      fragile: healFrequency > 0.5,
    })
  }

  return result
}

/**
 * Get fragile step indices from execution history.
 */
export function getFragileStepIndices(
  executions: SkillExecution[],
  totalSteps: number,
): number[] {
  return computeStepFragility(executions, totalSteps)
    .filter((s) => s.fragile)
    .map((s) => s.stepIndex)
}
