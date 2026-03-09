// lib/skills/urlPattern.ts — URL hierarchy matching utilities

/**
 * Derive a urlPattern from a raw URL.
 *
 * 'https://trade.taobao.com/order/detail?id=123' → 'trade.taobao.com/order/detail'
 * 'https://taobao.com/' → 'taobao.com'
 * '' or invalid → '*'
 */
export function deriveUrlPattern(rawUrl: string): string {
  if (!rawUrl) return '*'
  try {
    const url = new URL(rawUrl)
    const hostname = url.hostname.toLowerCase()
    // Strip trailing slashes and clean up path
    const path = url.pathname.replace(/\/+$/, '')
    if (!path || path === '/') return hostname
    return hostname + path
  } catch {
    return '*'
  }
}

/**
 * Generate a URL hierarchy chain from most specific to most general.
 *
 * 'https://trade.taobao.com/order/detail?id=123'
 * → ['trade.taobao.com/order/detail', 'trade.taobao.com/order', 'trade.taobao.com', '*']
 *
 * '' or invalid → ['*']
 */
export function getUrlHierarchy(rawUrl: string): string[] {
  if (!rawUrl) return ['*']
  try {
    const url = new URL(rawUrl)
    const hostname = url.hostname.toLowerCase()
    const path = url.pathname.replace(/\/+$/, '')

    const hierarchy: string[] = []

    if (path && path !== '/') {
      const segments = path.split('/').filter(Boolean)
      // Build from most specific to least specific
      for (let i = segments.length; i >= 1; i--) {
        hierarchy.push(hostname + '/' + segments.slice(0, i).join('/'))
      }
    }

    hierarchy.push(hostname)
    hierarchy.push('*')
    return hierarchy
  } catch {
    return ['*']
  }
}

/**
 * Match a skill's urlPattern against a URL hierarchy chain.
 *
 * Returns -1 if no match, or a non-negative depth score where:
 * - 0 = universal '*' match
 * - higher values = more specific matches (index from end of hierarchy)
 *
 * The depth corresponds to the hierarchy position:
 * hierarchy = ['trade.taobao.com/order/detail', 'trade.taobao.com/order', 'trade.taobao.com', '*']
 * '*' → depth 0, 'trade.taobao.com' → depth 1, 'trade.taobao.com/order' → depth 2, etc.
 */
export function matchUrlPattern(skillPattern: string, urlHierarchy: string[]): number {
  if (!skillPattern || !urlHierarchy.length) return -1

  const patternLower = skillPattern.toLowerCase()
  const idx = urlHierarchy.indexOf(patternLower)
  if (idx === -1) return -1

  // Depth = distance from the end (most general). Higher = more specific.
  return urlHierarchy.length - 1 - idx
}
