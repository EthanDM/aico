import { ProcessedDiff, PullRequestTemplate } from '../types'
import { CommitHeuristics } from './CommitHeuristics'
import { ScopeInferrer } from './ScopeInferrer'

type PullRequestType = 'fix' | 'feat' | 'refactor' | 'chore' | 'perf' | 'docs'

interface PullRequestHeuristicsResult {
  type: PullRequestType
  scope: string
  template: PullRequestTemplate
  groupings: string[]
  platformHints: string[]
  riskLevel: 'low' | 'med' | 'high'
  testTouched: boolean
  uiTouched: boolean
  behaviorSummary?: string
}

const TYPE_MATCH = /^(fix|feat|refactor|chore|perf|docs)(\(.+\))?:\s+/i
const DEFAULT_SCOPE = 'core'
const INFRA_GROUPS = new Set([
  'services',
  'service',
  'constants',
  'cli',
  'heuristics',
  'processors',
  'prompts',
  'types',
  'validation',
  'tests',
  'test',
  'docs',
  'doc',
  'readme',
  'config',
  'scripts',
  'dist',
  'build',
  'node_modules',
])
const INFRA_GROUP_PATTERN = /^(readme|changelog|license|package|tsconfig|config|cli|dist|build)/

export class PullRequestHeuristics {
  constructor(
    private commitHeuristics: CommitHeuristics,
    private scopeInferrer: ScopeInferrer
  ) { }

  public infer(
    diff: ProcessedDiff,
    branchName: string,
    commitSubjects: string[] = [],
    userContext?: string
  ): PullRequestHeuristicsResult {
    const paths = diff.signals?.nameStatus?.map((entry) => entry.path) || []
    const snippets = diff.signals?.patchSnippets?.join('\n') || ''
    const textContext = [userContext || '', ...commitSubjects].join(' ').toLowerCase()

    const type = this.inferType(diff, commitSubjects, userContext)
    const scope = this.inferScope(branchName, paths, commitSubjects)
    const groupings = this.inferGroupings(paths)
    const template = this.inferTemplate(diff, textContext, groupings)
    const platformHints = this.inferPlatforms(paths)
    const testTouched = this.isTestTouched(paths)
    const uiTouched = this.isUiTouched(paths)
    const riskLevel = this.inferRiskLevel(paths, snippets)
    const behaviorSummary = this.inferBehaviorSummary(
      type,
      scope,
      commitSubjects,
      userContext
    )

    return {
      type,
      scope,
      template,
      groupings,
      platformHints,
      riskLevel,
      testTouched,
      uiTouched,
      behaviorSummary,
    }
  }

  private inferBehaviorSummary(
    type: PullRequestType,
    scope: string,
    commitSubjects: string[],
    userContext?: string
  ): string | undefined {
    const context = userContext?.trim()
    if (context) {
      return `${this.capitalize(type)} ${scope} behavior: ${context}.`
    }

    const subject = commitSubjects.find((line) => line.trim().length > 0)
    if (subject) {
      const clean = subject.replace(TYPE_MATCH, '').trim()
      if (clean) {
        return `${this.capitalize(type)} ${scope} behavior: ${clean}.`
      }
    }

    return undefined
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1)
  }

  private inferType(
    diff: ProcessedDiff,
    commitSubjects: string[],
    userContext?: string
  ): PullRequestType {
    const counts = new Map<PullRequestType, number>()
    for (const subject of commitSubjects) {
      const match = subject.match(TYPE_MATCH)
      if (match) {
        const type = match[1].toLowerCase() as PullRequestType
        counts.set(type, (counts.get(type) || 0) + 1)
      }
    }

    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
    if (top) {
      return top[0]
    }

    const context = (userContext || '').toLowerCase()
    if (/(fix|bug|crash|regression|prevent)/.test(context)) return 'fix'
    if (/(perf|performance|latency|faster|speed)/.test(context)) return 'perf'
    if (/(docs|readme|changelog)/.test(context)) return 'docs'
    if (/(refactor|cleanup|restructure)/.test(context)) return 'refactor'

    if (this.commitHeuristics.isDocsOnlyChange(diff)) return 'docs'
    if (this.isTestOnly(diff)) return 'chore'
    if (this.commitHeuristics.isInternalToolingChange(diff)) return 'refactor'

    const hasNewFiles = diff.signals?.nameStatus?.some((entry) => entry.status === 'A')
    if (hasNewFiles) return 'feat'

    return 'chore'
  }

  private inferScope(
    branchName: string,
    paths: string[],
    commitSubjects: string[]
  ): string {
    const branchScope = this.inferScopeFromBranch(branchName)
    if (branchScope) {
      return branchScope
    }

    const inferred = this.scopeInferrer.infer(
      paths.length > 0 ? paths : commitSubjects
    )
    if (inferred) {
      return inferred
    }

    const area = this.inferTopArea(paths)
    return area || DEFAULT_SCOPE
  }

  private inferScopeFromBranch(branchName: string): string | undefined {
    const cleaned = branchName.replace(/^refs\/heads\//, '').toLowerCase()
    const parts = cleaned.split(/[\/_-]+/).filter(Boolean)
    const filtered = parts.filter(
      (part) =>
        ![
          'feat',
          'fix',
          'refactor',
          'chore',
          'perf',
          'docs',
          'feature',
          'bug',
          'hotfix',
        ].includes(part)
    )
    const candidate = filtered[0]
    if (candidate && candidate.length >= 2) {
      return candidate.replace(/[^a-z0-9-]/g, '')
    }
    return undefined
  }

  private inferTopArea(paths: string[]): string | undefined {
    if (paths.length === 0) return undefined
    const counts = new Map<string, number>()
    for (const path of paths) {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) continue
      const area =
        parts[0] === 'src' && parts.length > 1 ? parts[1] : parts[0]
      counts.set(area, (counts.get(area) || 0) + 1)
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
    if (!top) return undefined
    return top[0].replace(/[^a-z0-9-]/g, '')
  }

  private inferGroupings(paths: string[]): string[] {
    if (paths.length === 0) return []
    const counts = new Map<string, number>()
    for (const path of paths) {
      const parts = path.split('/').filter(Boolean)
      if (parts.length === 0) continue
      const area =
        parts[0] === 'src' && parts.length > 1 ? parts[1] : parts[0]
      const normalized = area.toLowerCase().replace(/[^a-z0-9-]/g, '')
      if (
        !normalized ||
        INFRA_GROUPS.has(normalized) ||
        INFRA_GROUP_PATTERN.test(normalized)
      ) {
        continue
      }
      counts.set(normalized, (counts.get(normalized) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([area]) => area)
      .slice(0, 5)
  }

  private inferTemplate(
    diff: ProcessedDiff,
    contextText: string,
    groupings: string[]
  ): PullRequestTemplate {
    const linesChanged = diff.stats.additions + diff.stats.deletions
    const isLarge = diff.stats.filesChanged >= 8 || linesChanged >= 200
    const isSubtle = /(race|stale|timing|concurr|debounce|throttle)/.test(
      contextText
    )
    if (isSubtle) return 'subtle-bug'
    const isGrouped = groupings.length >= 2 && isLarge
    if (isGrouped) return 'grouped'
    return 'default'
  }

  private inferPlatforms(paths: string[]): string[] {
    const hints = new Set<string>()
    for (const path of paths) {
      if (/ios/i.test(path)) hints.add('iOS')
      if (/android/i.test(path)) hints.add('Android')
      if (/web/i.test(path)) hints.add('Web')
    }
    return Array.from(hints)
  }

  private isTestTouched(paths: string[]): boolean {
    return paths.some((path) =>
      /(test|tests|__tests__|spec)\b/i.test(path)
    )
  }

  private isUiTouched(paths: string[]): boolean {
    return paths.some((path) =>
      /(ui|views?|screens?|components?|styles?)/i.test(path)
    )
  }

  private isTestOnly(diff: ProcessedDiff): boolean {
    const paths = diff.signals?.nameStatus?.map((entry) => entry.path) || []
    if (paths.length === 0) return false
    return paths.every((path) =>
      /(test|tests|__tests__|spec)\b/i.test(path)
    )
  }

  private inferRiskLevel(paths: string[], snippets: string): 'low' | 'med' | 'high' {
    const riskyPath = paths.some((path) =>
      /(auth|payment|billing|migration|schema|config|permissions|security)/i.test(
        path
      )
    )
    const riskySnippet = /(migrate|backfill|drop|alter|permission|token)/i.test(
      snippets
    )
    if (riskyPath && riskySnippet) return 'high'
    if (riskyPath || riskySnippet) return 'med'
    return 'low'
  }
}
