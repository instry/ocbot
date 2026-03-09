import { fetchMarketplaceSkills, fetchMarketplaceSkill, type MarketplaceSkillSummary } from '@/lib/marketplace/api'

export interface Skill {
  id: string
  name: string
  description: string
  iconUrl?: string
  categories: string[]
  installs: number
  version: string
  official?: boolean
  author: string
  creating?: boolean
  publishedId?: string  // if published to marketplace, the published skill ID
}

/** Known brand keywords → abbreviation for icon fallback */
const BRAND_MAP: Record<string, string> = {
  linkedin: 'Li',
  twitter: 'Tw',
  facebook: 'Fb',
  instagram: 'Ig',
  tiktok: 'Tk',
  youtube: 'YT',
  reddit: 'Re',
  pinterest: 'Pi',
  whatsapp: 'WA',
  google: 'G',
  amazon: 'a',
  airtable: 'At',
  notion: 'No',
  slack: 'Sl',
  yandex: 'YM',
}

/** Get icon text for a skill: match known brand or use first 2 letters */
export function getSkillAbbr(name: string): string {
  const lower = name.toLowerCase()
  for (const [keyword, abbr] of Object.entries(BRAND_MAP)) {
    if (lower.includes(keyword)) return abbr
  }
  const words = name.split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export interface SkillParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select'
  description: string
  required: boolean
  default?: string | number | boolean
  options?: string[]
}

export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

export interface SkillDetail extends Skill {
  longDescription: string
  screenshots: string[]
  changelog: ChangelogEntry[]
  parameters: SkillParameter[]
  compatibleSites: string[]
  rating: number
  runCount: number
  updatedAt: string
  // Stats
  successRate: number    // 0-100 percentage
  avgDurationMs: number  // average execution time in ms
  avgTokens: number      // average token usage per run
}

// ---------------------------------------------------------------------------
// Marketplace functions
// ---------------------------------------------------------------------------

/** Convert a MarketplaceSkillSummary into the display Skill type */
export function toMarketplaceDisplaySkill(ms: MarketplaceSkillSummary): Skill {
  return {
    id: ms.id,
    name: ms.name,
    description: ms.description,
    categories: ms.categories,
    installs: 0,
    version: `v${ms.version}`,
    official: false,
    author: ms.author,
    publishedId: ms.id,
  }
}

/** Fetch marketplace skills from the server with filtering and pagination */
export async function getMarketplaceSkills(
  category?: string,
  query?: string,
  offset = 0,
  limit = 30,
): Promise<{ skills: Skill[]; total: number }> {
  const { skills, total } = await fetchMarketplaceSkills({
    category: category && category !== 'All' ? category : undefined,
    q: query || undefined,
    offset,
    limit,
  })
  return {
    skills: skills.map(toMarketplaceDisplaySkill),
    total,
  }
}

/** Fetch a single marketplace skill detail from the server */
export async function getMarketplaceSkillDetail(id: string): Promise<SkillDetail | null> {
  try {
    const real = await fetchMarketplaceSkill(id)
    return toDisplaySkillDetail(real, true)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Local skill functions
// ---------------------------------------------------------------------------

import { SkillStore } from '@/lib/skills/store'
import type { Skill as RealSkill, SkillExecution as RealSkillExecution } from '@/lib/skills/types'
import { computeStepFragility, type StepFragility } from '@/lib/skills/fragility'

// Convert internal Skill to display Skill format
export function toDisplaySkill(real: RealSkill, isMarketplace = false): Skill {
  return {
    id: real.id,
    name: real.name,
    description: real.description,
    categories: real.categories,
    installs: real.totalRuns,
    version: `v${real.version}`,
    official: false,
    author: real.author,
    creating: real.status === 'creating',
    publishedId: isMarketplace ? real.id : undefined,
  }
}

// Convert internal Skill to display SkillDetail format
export function toDisplaySkillDetail(
  real: RealSkill,
  isMarketplace = false,
  executions?: RealSkillExecution[],
): SkillDetail {
  const successRate = real.totalRuns > 0
    ? Math.round((real.successCount / real.totalRuns) * 100)
    : 0

  let avgDurationMs = 0
  let avgTokens = 0
  if (executions && executions.length > 0) {
    avgDurationMs = Math.round(executions.reduce((sum, e) => sum + e.durationMs, 0) / executions.length)
    const tokenExecs = executions.filter(e => e.tokenUsage && e.tokenUsage > 0)
    if (tokenExecs.length > 0) {
      avgTokens = Math.round(tokenExecs.reduce((sum, e) => sum + (e.tokenUsage || 0), 0) / tokenExecs.length)
    }
  }

  return {
    ...toDisplaySkill(real, isMarketplace),
    longDescription: real.skillMd || real.description,
    screenshots: [],
    changelog: [],
    parameters: real.parameters.map(p => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required,
      default: p.default,
      options: p.options,
    })),
    compatibleSites: real.startUrl ? [new URL(real.startUrl).hostname] : [],
    rating: real.score * 5,
    runCount: real.totalRuns,
    updatedAt: new Date(real.updatedAt).toISOString().slice(0, 10),
    successRate,
    avgDurationMs,
    avgTokens,
  }
}

const skillStoreInstance = new SkillStore()

export async function getLocalSkills(): Promise<Skill[]> {
  const skills = await skillStoreInstance.list()
  return skills.filter(s => s.source === 'user').map(s => toDisplaySkill(s))
}

export async function getLocalSkillDetail(id: string): Promise<SkillDetail | null> {
  const skill = await skillStoreInstance.get(id)
  if (!skill) return null
  const executions = await skillStoreInstance.getExecutions(id)
  return toDisplaySkillDetail(skill, false, executions)
}

export async function deleteLocalSkill(id: string): Promise<void> {
  await skillStoreInstance.delete(id)
}

export { skillStoreInstance }

export async function getSkillExecutions(skillId: string): Promise<RealSkillExecution[]> {
  return skillStoreInstance.getExecutions(skillId)
}

export async function getSkillFragility(skillId: string): Promise<StepFragility[]> {
  const skill = await skillStoreInstance.get(skillId)
  if (!skill) return []
  const executions = await skillStoreInstance.getExecutions(skillId)
  return computeStepFragility(executions, skill.steps.length)
}

export async function getRealSkill(skillId: string): Promise<RealSkill | null> {
  return skillStoreInstance.get(skillId)
}

export async function saveRealSkill(skill: RealSkill): Promise<void> {
  await skillStoreInstance.save(skill)
}

export type { RealSkill, RealSkillExecution, StepFragility }
