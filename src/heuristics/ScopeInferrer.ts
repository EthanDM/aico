import { Config } from '../types'

type CommitConfig = Config['commit']

export interface ScopeRule {
  scope: string
  match: RegExp
}

/**
 * Service for inferring scope from file paths based on configurable rules.
 */
export class ScopeInferrer {
  private scopeRules: ScopeRule[]

  constructor(rawRules: Array<{ scope: string; match: string }> = []) {
    this.scopeRules = this.parseScopeRules(rawRules)
  }

  /**
   * Infers the most common scope from a list of file paths.
   *
   * @param paths - Array of file paths
   * @returns The inferred scope, or undefined if no match
   */
  infer(paths: string[]): string | undefined {
    const counts = new Map<string, number>()

    for (const path of paths) {
      for (const entry of this.scopeRules) {
        if (entry.match.test(path)) {
          counts.set(entry.scope, (counts.get(entry.scope) || 0) + 1)
        }
      }
    }

    const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
    return best?.[0]
  }

  /**
   * Parses raw scope rules and tries to compile regexes.
   * Falls back to default rules if parsing fails or no rules provided.
   *
   * @param rawRules - Raw scope rules from config
   * @returns Array of parsed scope rules
   */
  private parseScopeRules(
    rawRules: Array<{ scope: string; match: string }>
  ): ScopeRule[] {
    const fallbackRules = this.getFallbackRules()

    if (!rawRules || rawRules.length === 0) {
      return fallbackRules
    }

    const parsed = rawRules
      .map((rule) => {
        try {
          return { scope: rule.scope, match: new RegExp(rule.match) }
        } catch {
          return undefined
        }
      })
      .filter(Boolean) as ScopeRule[]

    if (parsed.length === 0) {
      return fallbackRules
    }
    return parsed
  }

  /**
   * Gets the default fallback scope rules.
   *
   * @returns Array of default scope rules
   */
  private getFallbackRules(): ScopeRule[] {
    return [
      { scope: 'translations', match: /\/translations\// },
      { scope: 'tests', match: /\/(__tests__|tests)\// },
      { scope: 'config', match: /(config|\.config|tsconfig|package)\./ },
      { scope: 'docs', match: /\/(docs|doc)\// },
      { scope: 'services', match: /\/services\// },
    ]
  }
}
