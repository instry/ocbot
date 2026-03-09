export type Variables = Record<string, string>

/**
 * Replace %variableName% placeholders in text with their values.
 */
export function substituteVariables(text: string, variables: Variables): string {
  return text.replace(/%([a-zA-Z_][a-zA-Z0-9_]*)%/g, (match, key) => {
    return key in variables ? variables[key] : match
  })
}

/**
 * Extract sorted variable keys for cache key generation.
 * Only keys are included — values are never stored in cache keys.
 */
export function variableKeysForCache(variables: Variables): string[] {
  return Object.keys(variables).sort()
}
