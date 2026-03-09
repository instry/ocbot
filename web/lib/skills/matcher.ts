// lib/skills/matcher.ts
import type { Skill, SkillMatch, SkillPrecondition } from './types'
import type { SkillStore } from './store'
import type { LlmProvider } from '@/lib/llm/types'
import { streamChat } from '@/lib/llm/client'
import { getUrlHierarchy, matchUrlPattern, deriveUrlPattern } from './urlPattern'

/**
 * Phase 0: triggerPhrases text match (no LLM, instant).
 *
 * If the normalized user message contains any of a skill's triggerPhrases,
 * return a strong match immediately.
 */
function triggerPhraseMatch(
  skills: Skill[],
  normalizedMessage: string,
): SkillMatch | null {
  for (const skill of skills) {
    if (!skill.triggerPhrases?.length) continue
    const matched = skill.triggerPhrases.some(phrase =>
      normalizedMessage.includes(phrase.toLowerCase()),
    )
    if (matched) return { skill, confidence: 'strong', matchDepth: -1 }
  }
  return null
}

/**
 * Phase 1: URL hierarchy match (no LLM, instant).
 *
 * Matches skills by urlPattern against the current URL's hierarchy chain,
 * from most specific to most general. Requires text overlap with skill name.
 */
function urlHierarchyMatch(
  skills: Skill[],
  userMessage: string,
  currentUrl: string,
): SkillMatch | null {
  const hierarchy = getUrlHierarchy(currentUrl)
  const msgLower = userMessage.toLowerCase()

  const candidates: Array<{ skill: Skill; depth: number; textScore: number }> = []

  for (const skill of skills) {
    const pattern = skill.urlPattern || deriveUrlPattern(skill.startUrl)
    const depth = matchUrlPattern(pattern, hierarchy)
    if (depth < 0) continue

    // Text similarity: name words (>= 3 chars) that appear in user message
    const nameWords = skill.name.replace(/-/g, ' ').split(/\s+/)
      .map(w => w.toLowerCase()).filter(w => w.length >= 3)
    const textScore = nameWords.filter(w => msgLower.includes(w)).length
    if (textScore > 0) {
      candidates.push({ skill, depth, textScore })
    }
  }

  if (candidates.length === 0) return null

  // Sort: depth first (most specific), then textScore
  candidates.sort((a, b) => b.depth !== a.depth ? b.depth - a.depth : b.textScore - a.textScore)

  const best = candidates[0]
  return {
    skill: best.skill,
    confidence: best.depth > 0 ? 'strong' : 'weak',
    matchDepth: best.depth,
  }
}

/**
 * Check skill preconditions against the current tab.
 * Returns true if all preconditions are met (or if there are none).
 */
async function checkPreconditions(
  preconditions: SkillPrecondition[],
  tabId: number,
): Promise<boolean> {
  if (!preconditions || preconditions.length === 0) return true

  for (const pc of preconditions) {
    switch (pc.type) {
      case 'element_visible': {
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: (sel: string) => !!document.querySelector(sel),
            args: [pc.selector!],
          })
          if (!result?.result) return false
        } catch {
          return false
        }
        break
      }
      case 'url_contains': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.url?.includes(pc.value!)) return false
        break
      }
      case 'page_title_contains': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.title?.toLowerCase().includes(pc.value!.toLowerCase())) return false
        break
      }
    }
  }
  return true
}

/**
 * Strip markdown code fences from a string so we can parse raw JSON.
 * Handles ```json ... ``` and ``` ... ``` patterns.
 */
function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}

/**
 * Phase 2: LLM semantic match.
 *
 * Sends a compact skill list to the LLM and asks whether the user's intent
 * matches any skill. Returns a weak or strong match, or null.
 */
async function llmMatch(
  skills: Skill[],
  userMessage: string,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<SkillMatch | null> {
  const compactList = skills.slice(0, 30).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    startUrl: s.startUrl,
  }))

  const prompt = [
    'You are a skill matcher. Given the user message and the list of available skills, determine if the user\'s intent matches any skill.',
    '',
    'Skills:',
    JSON.stringify(compactList),
    '',
    `User message: "${userMessage}"`,
    '',
    'If a skill matches, respond with JSON: {"id": "<skill_id>", "confidence": "strong"|"weak"}',
    'If no skill matches, respond with JSON: {"id": null}',
    'Respond ONLY with the JSON object, nothing else.',
  ].join('\n')

  let responseText = ''

  const stream = streamChat(
    provider,
    [{ role: 'user', content: prompt }],
    undefined,
    signal,
  )

  for await (const event of stream) {
    if (event.type === 'text_delta') {
      responseText += event.text
    } else if (event.type === 'error') {
      console.warn('[SkillMatcher] LLM error:', event.error)
      return null
    }
  }

  try {
    const cleaned = stripCodeFences(responseText)
    const parsed = JSON.parse(cleaned) as { id: string | null; confidence?: 'strong' | 'weak' }

    if (!parsed.id) return null

    const matched = skills.find((s) => s.id === parsed.id)
    if (!matched) return null

    return {
      skill: matched,
      confidence: parsed.confidence === 'strong' ? 'strong' : 'weak',
      matchDepth: 0,
    }
  } catch {
    console.warn('[SkillMatcher] Failed to parse LLM response:', responseText)
    return null
  }
}

/**
 * Match a user message against installed skills.
 *
 * Runs phases:
 * 0. triggerPhrases exact match (instant)
 * 1. URL hierarchy match with text overlap (instant)
 * 2. LLM semantic match (disabled)
 *
 * Preconditions are checked on the matched skill before returning.
 */
export async function matchSkill(
  userMessage: string,
  currentUrl: string,
  provider: LlmProvider,
  store: SkillStore,
  signal?: AbortSignal,
  tabId?: number,
): Promise<SkillMatch | null> {
  const allSkills = await store.list()
  const activeSkills = allSkills.filter((s) => s.status === 'active' && s.source !== 'auto')

  if (activeSkills.length === 0) return null

  const normalized = userMessage.trim().toLowerCase()

  // Phase 0: triggerPhrases text match
  const phraseMatch = triggerPhraseMatch(activeSkills, normalized)
  if (phraseMatch) {
    if (tabId && phraseMatch.skill.preconditions?.length) {
      const ok = await checkPreconditions(phraseMatch.skill.preconditions, tabId)
      if (!ok) {
        // Preconditions not met — skip this match, fall through to URL match
      } else {
        return phraseMatch
      }
    } else {
      return phraseMatch
    }
  }

  // Phase 1: URL hierarchy match
  const urlMatch = urlHierarchyMatch(activeSkills, userMessage, currentUrl)
  if (urlMatch) {
    if (tabId && urlMatch.skill.preconditions?.length) {
      const ok = await checkPreconditions(urlMatch.skill.preconditions, tabId)
      if (!ok) return null
    }
    return urlMatch
  }

  // Phase 2 skipped — URL hierarchy match is sufficient for installed skills
  // llmMatch kept in file for potential future re-enablement behind a flag
  return null
}

/**
 * Match a user instruction against auto-skills.
 * Uses URL prefix matching instead of hostname-only matching.
 * Touches updatedAt on hit to keep LRU fresh.
 */
export async function matchAutoSkill(
  instruction: string,
  configSignature: string,
  currentUrl: string,
  store: SkillStore,
): Promise<Skill | null> {
  const allSkills = await store.list()
  const normalized = instruction.trim().toLowerCase()
  const hierarchy = getUrlHierarchy(currentUrl)

  // Find matching auto-skills, preferring higher depth (more specific URL match)
  let bestMatch: Skill | null = null
  let bestDepth = -1

  for (const s of allSkills) {
    if (s.source !== 'auto' || s.status !== 'active') continue
    if (s.instruction !== normalized || s.configSignature !== configSignature) continue

    // Skip URL check if the skill starts with a navigate step
    if (s.steps[0]?.type === 'navigate') {
      // Navigate skills match regardless of current URL — take first match
      if (!bestMatch) {
        bestMatch = s
        bestDepth = 0
      }
      continue
    }

    const pattern = s.urlPattern || deriveUrlPattern(s.startUrl)
    const depth = matchUrlPattern(pattern, hierarchy)
    if (depth >= 0 && depth > bestDepth) {
      bestMatch = s
      bestDepth = depth
    }
  }

  if (!bestMatch) return null

  // Touch updatedAt to keep LRU fresh
  const updated: Skill = { ...bestMatch, updatedAt: Date.now() }
  await store.saveAutoSkill(updated)
  return updated
}
