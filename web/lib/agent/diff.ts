// lib/agent/diff.ts — Compare two PageSnapshots to detect changes
import type { PageSnapshot, PageElement } from './snapshot'

export interface DiffResult {
  changed: boolean
  addedElements: PageElement[]
  removedElements: PageElement[]
  urlChanged: boolean
}

/**
 * Compare two PageSnapshots and return a diff summary.
 * Used to detect "click had no effect" during skill replay.
 */
export function diffTrees(before: PageSnapshot, after: PageSnapshot): DiffResult {
  const urlChanged = before.url !== after.url

  const beforeIds = new Set(before.elements.map((el) => `${el.role}:${el.name}:${el.backendNodeId}`))
  const afterIds = new Set(after.elements.map((el) => `${el.role}:${el.name}:${el.backendNodeId}`))

  const addedElements: PageElement[] = []
  const removedElements: PageElement[] = []

  for (const el of after.elements) {
    const key = `${el.role}:${el.name}:${el.backendNodeId}`
    if (!beforeIds.has(key)) {
      addedElements.push(el)
    }
  }

  for (const el of before.elements) {
    const key = `${el.role}:${el.name}:${el.backendNodeId}`
    if (!afterIds.has(key)) {
      removedElements.push(el)
    }
  }

  const changed = urlChanged || addedElements.length > 0 || removedElements.length > 0

  return { changed, addedElements, removedElements, urlChanged }
}
