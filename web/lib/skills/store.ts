// lib/skills/store.ts
import type { Skill, SkillExecution } from './types'
import { deriveUrlPattern, getUrlHierarchy, matchUrlPattern } from './urlPattern'
import { storage } from '../storage-backend'

const SKILLS_KEY = 'ocbot_skills'
const EXECUTIONS_KEY = 'ocbot_skill_executions'
const MAX_SKILLS = 200
const MAX_EXECUTIONS_PER_SKILL = 50
const MAX_AUTO_SKILLS = 50

export class SkillStore {
  // === Internal storage access ===

  private backfilled = false
  private urlPatternBackfilled = false

  private async getAll(): Promise<Record<string, Skill>> {
    const result = await storage.get(SKILLS_KEY)
    return (result[SKILLS_KEY] as Record<string, Skill>) || {}
  }

  private async setAll(data: Record<string, Skill>): Promise<void> {
    await storage.set({ [SKILLS_KEY]: data })
  }

  private async getAllExecutions(): Promise<Record<string, SkillExecution[]>> {
    const result = await storage.get(EXECUTIONS_KEY)
    return (result[EXECUTIONS_KEY] as Record<string, SkillExecution[]>) || {}
  }

  private async setAllExecutions(data: Record<string, SkillExecution[]>): Promise<void> {
    await storage.set({ [EXECUTIONS_KEY]: data })
  }

  // === Skill CRUD ===

  /** All skills sorted by updatedAt descending. */
  async list(): Promise<Skill[]> {
    if (!this.backfilled) {
      this.backfilled = true
      await this.backfillTriggerPhrases()
    }
    if (!this.urlPatternBackfilled) {
      this.urlPatternBackfilled = true
      await this.backfillUrlPatterns()
    }
    const all = await this.getAll()
    return Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async get(id: string): Promise<Skill | null> {
    const all = await this.getAll()
    return all[id] ?? null
  }

  /** Upsert a skill. Applies LRU eviction when over MAX_SKILLS. */
  async save(skill: Skill): Promise<void> {
    const all = await this.getAll()

    // LRU eviction if at capacity and this is a new skill
    if (!all[skill.id]) {
      const keys = Object.keys(all)
      if (keys.length >= MAX_SKILLS) {
        const sorted = keys.sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0))
        const toRemove = sorted.slice(0, keys.length - MAX_SKILLS + 1)
        for (const k of toRemove) delete all[k]
      }
    }

    all[skill.id] = skill
    await this.setAll(all)
  }

  /** Delete a skill and its execution history. */
  async delete(id: string): Promise<void> {
    const all = await this.getAll()
    delete all[id]
    await this.setAll(all)

    const execs = await this.getAllExecutions()
    delete execs[id]
    await this.setAllExecutions(execs)
  }

  /**
   * Save an auto-skill with separate capacity management.
   * Evicts oldest auto-skills (by updatedAt) when at MAX_AUTO_SKILLS.
   * Never touches user skills.
   */
  async saveAutoSkill(skill: Skill): Promise<void> {
    const all = await this.getAll()

    // Count existing auto-skills and evict oldest if at capacity
    if (!all[skill.id]) {
      const autoEntries = Object.entries(all)
        .filter(([, s]) => s.source === 'auto')
      if (autoEntries.length >= MAX_AUTO_SKILLS) {
        const sorted = autoEntries.sort(
          ([, a], [, b]) => (a.updatedAt || 0) - (b.updatedAt || 0),
        )
        const toRemove = sorted.slice(0, autoEntries.length - MAX_AUTO_SKILLS + 1)
        for (const [k] of toRemove) delete all[k]
      }
    }

    all[skill.id] = skill
    await this.setAll(all)
  }

  /** Filter skills by name or description (case-insensitive substring match). */
  async search(query: string): Promise<Skill[]> {
    const q = query.trim().toLowerCase()
    if (!q) return this.list()
    const all = await this.getAll()
    return Object.values(all)
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // === Backfill ===

  /** Backfill triggerPhrases for existing user skills that lack them. */
  async backfillTriggerPhrases(): Promise<number> {
    const all = await this.getAll()
    let count = 0
    for (const skill of Object.values(all)) {
      if (skill.source === 'auto') continue
      if (skill.triggerPhrases?.length) continue

      const words = new Set<string>()
      skill.name.replace(/-/g, ' ').split(/\s+/)
        .filter(w => w.length >= 3)
        .forEach(w => words.add(w.toLowerCase()))
      skill.description.split(/\s+/)
        .filter(w => w.length >= 3).slice(0, 5)
        .forEach(w => words.add(w.toLowerCase()))

      skill.triggerPhrases = Array.from(words).slice(0, 5)
      if (skill.triggerPhrases.length > 0) {
        all[skill.id] = skill
        count++
      }
    }
    if (count > 0) await this.setAll(all)
    return count
  }

  /** Backfill urlPattern for existing skills that lack it (derived from startUrl). */
  async backfillUrlPatterns(): Promise<number> {
    const all = await this.getAll()
    let count = 0
    for (const skill of Object.values(all)) {
      if (skill.urlPattern) continue
      skill.urlPattern = deriveUrlPattern(skill.startUrl)
      skill.preconditions = skill.preconditions || []
      all[skill.id] = skill
      count++
    }
    if (count > 0) await this.setAll(all)
    return count
  }

  /** List skills that match the given URL, sorted by specificity (most specific first). */
  async listByUrl(currentUrl: string): Promise<Skill[]> {
    const hierarchy = getUrlHierarchy(currentUrl)
    const all = await this.getAll()
    return Object.values(all)
      .filter(s => matchUrlPattern(s.urlPattern || deriveUrlPattern(s.startUrl), hierarchy) >= 0)
      .sort((a, b) => {
        const da = matchUrlPattern(a.urlPattern || deriveUrlPattern(a.startUrl), hierarchy)
        const db = matchUrlPattern(b.urlPattern || deriveUrlPattern(b.startUrl), hierarchy)
        return db - da
      })
  }

  // === Execution history ===

  /** Prepend an execution, keeping at most MAX_EXECUTIONS_PER_SKILL per skill. */
  async addExecution(execution: SkillExecution): Promise<void> {
    const all = await this.getAllExecutions()
    const list = all[execution.skillId] || []
    list.unshift(execution)
    all[execution.skillId] = list.slice(0, MAX_EXECUTIONS_PER_SKILL)
    await this.setAllExecutions(all)
  }

  async getExecutions(skillId: string): Promise<SkillExecution[]> {
    const all = await this.getAllExecutions()
    return all[skillId] || []
  }

  // === Score computation ===

  /**
   * Compute a composite score from execution history.
   *
   * Formula: successRate * 0.35 + stability * 0.25 + efficiency * 0.15
   *        + satisfaction * 0.15 + usageFrequency * 0.10
   *
   * - successRate: success/total over recent 20 executions
   * - stability: 1 - (executions needing L2+ heal / total recent)
   * - efficiency: 1 - (avg heal level / 4)
   * - satisfaction: good / (good + bad), default 0.5 if no feedback
   * - usageFrequency: min(1, total executions / 50) — rewards frequently used skills
   */
  computeScore(executions: SkillExecution[]): number {
    if (executions.length === 0) return 0.5

    const recent = executions.slice(0, 20)
    const total = recent.length

    // successRate
    const successCount = recent.filter((e) => e.success).length
    const successRate = successCount / total

    // stability: 1 - (executions with any heal level >= 2 / total)
    const l2HealCount = recent.filter((e) =>
      e.healEvents.some((h) => h.level >= 2),
    ).length
    const stability = 1 - l2HealCount / total

    // efficiency: 1 - (avg max heal level across executions / 4)
    const healLevels = recent.map((e) => {
      if (e.healEvents.length === 0) return 0
      return Math.max(...e.healEvents.map((h) => h.level))
    })
    const avgHealLevel = healLevels.reduce((a, b) => a + b, 0) / total
    const efficiency = 1 - avgHealLevel / 4

    // satisfaction: good / (good + bad), default 0.5
    const good = recent.filter((e) => e.userFeedback === 'good').length
    const bad = recent.filter((e) => e.userFeedback === 'bad').length
    const satisfaction = good + bad > 0 ? good / (good + bad) : 0.5

    // usageFrequency: normalized by 50 (saturates at 50 total executions)
    const usageFrequency = Math.min(1, executions.length / 50)

    return (
      successRate * 0.35 +
      stability * 0.25 +
      efficiency * 0.15 +
      satisfaction * 0.15 +
      usageFrequency * 0.10
    )
  }
}
