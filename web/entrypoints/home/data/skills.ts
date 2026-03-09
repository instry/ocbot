import { fetchMarketplaceSkills, fetchMarketplaceSkill, type MarketplaceSkill } from '@/lib/marketplace/api'

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
  reviewCount: number
  runCount: number
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Marketplace functions (replace MOCK_SKILLS)
// ---------------------------------------------------------------------------

function parseCategories(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Convert a MarketplaceSkill from the server into the display Skill type */
export function toMarketplaceDisplaySkill(ms: MarketplaceSkill): Skill {
  return {
    id: ms.id,
    name: ms.name,
    description: ms.description,
    categories: parseCategories(ms.categories),
    installs: ms.clone_count,
    version: `v${ms.version}`,
    official: false,
    author: ms.author_name || 'community',
    publishedId: ms.id,
  }
}

/** Convert a MarketplaceSkill into a display SkillDetail */
export function toMarketplaceDisplayDetail(ms: MarketplaceSkill): SkillDetail {
  // Try to parse the data blob for richer detail
  let parameters: SkillParameter[] = []
  let longDescription = ms.description
  let compatibleSites: string[] = []

  try {
    const data = JSON.parse(ms.data)
    if (data.parameters) parameters = data.parameters
    if (data.skillMd) longDescription = data.skillMd
    if (data.startUrl) {
      try { compatibleSites = [new URL(data.startUrl).hostname] } catch {}
    }
  } catch {}

  return {
    ...toMarketplaceDisplaySkill(ms),
    longDescription,
    screenshots: [],
    changelog: [],
    parameters,
    compatibleSites,
    rating: 0,
    reviewCount: 0,
    runCount: ms.clone_count,
    updatedAt: ms.updated_at ? new Date(ms.updated_at).toISOString().slice(0, 10) : '',
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
    const ms = await fetchMarketplaceSkill(id)
    return toMarketplaceDisplayDetail(ms)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Local skill functions (unchanged)
// ---------------------------------------------------------------------------

import { SkillStore } from '@/lib/skills/store'
import type { Skill as RealSkill, SkillExecution as RealSkillExecution } from '@/lib/skills/types'
import { computeStepFragility, type StepFragility } from '@/lib/skills/fragility'

// Convert internal Skill to display Skill format
export function toDisplaySkill(real: RealSkill): Skill {
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
  }
}

// Convert internal Skill to display SkillDetail format
export function toDisplaySkillDetail(real: RealSkill): SkillDetail {
  return {
    ...toDisplaySkill(real),
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
    reviewCount: 0,
    runCount: real.totalRuns,
    updatedAt: new Date(real.updatedAt).toISOString().slice(0, 10),
  }
}

const skillStoreInstance = new SkillStore()

export async function getLocalSkills(): Promise<Skill[]> {
  const skills = await skillStoreInstance.list()
  return skills.filter(s => s.source === 'user').map(toDisplaySkill)
}

export async function getLocalSkillDetail(id: string): Promise<SkillDetail | null> {
  const skill = await skillStoreInstance.get(id)
  if (!skill) return null
  return toDisplaySkillDetail(skill)
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
