import { Config, ProcessedDiff } from '../types'
import { CommitHeuristics } from '../heuristics/CommitHeuristics'
import { ScopeInferrer } from '../heuristics/ScopeInferrer'
import GitService from '../services/Git.service'
import LoggerService from '../services/Logger.service'

type CommitConfig = Config['commit']

/**
 * Service for building prompts for OpenAI API calls.
 * Handles both commit message and branch name prompt generation.
 */
export class PromptBuilder {
  constructor(
    private config: Config,
    private heuristics: CommitHeuristics,
    private scopeInferrer: ScopeInferrer,
    private git: typeof GitService
  ) { }

  /**
   * Builds a prompt for commit message generation.
   *
   * @param diff - The processed diff
   * @param userContext - Optional user-provided context
   * @param includeBodyAllowed - Whether a body is allowed
   * @param includeBodyMode - Policy for including body
   * @param isMerge - Whether this is a merge commit
   * @returns The prompt string
   */
  async buildCommitPrompt(
    diff: ProcessedDiff,
    userContext?: string,
    includeBodyAllowed: boolean = false,
    includeBodyMode: CommitConfig['includeBody'] = 'auto',
    isMerge: boolean = false
  ): Promise<string> {
    const parts: string[] = [
      'Generate a conventional commit message for the changes below.',
    ]

    // Add branch context for scope hints
    const branchName = await this.git.getBranchName()
    if (
      branchName &&
      branchName !== 'main' &&
      branchName !== 'master' &&
      branchName !== 'develop'
    ) {
      // Extract potential scope from branch name
      const branchParts = branchName.split(/[-_/]/)
      const potentialScope = branchParts.find(
        (part) =>
          ![
            'feat',
            'fix',
            'chore',
            'docs',
            'style',
            'refactor',
            'test',
            'ci',
          ].includes(part.toLowerCase())
      )

      if (potentialScope && potentialScope.length > 2) {
        parts.push(
          `Branch: ${branchName} (scope hint: ${potentialScope.toLowerCase()})`
        )
      } else {
        parts.push(`Branch: ${branchName}`)
      }
    }

    // Check if this is a merge commit
    const {
      isMerge: confirmed,
      mergeInfo,
      sourceBranch,
      targetBranch,
    } = await this.detectMergeInfo(diff, userContext, isMerge)

    if (confirmed) {
      parts.push('This is a merge commit.')
      if (sourceBranch && targetBranch) {
        parts.push(`Merge: ${sourceBranch} → ${targetBranch}`)
      }
      if (mergeInfo) {
        parts.push(...mergeInfo)
      }
    }

    // Add user guidance if provided - but keep it focused
    if (userContext) {
      parts.push('User context:')
      parts.push(userContext)
    }

    if (includeBodyMode === 'never') {
      parts.push('Body is not allowed for this commit.')
    } else if (!includeBodyAllowed) {
      parts.push('Return only the subject line.')
    }

    parts.push(`Max subject length: ${this.config.commit.maxTitleLength} characters.`)

    if (includeBodyMode === 'always') {
      const recentCommits = await this.git.getRecentCommits(5)

      if (recentCommits.length > 0) {
        LoggerService.debug('\n🔍 Recent commits retrieved:')
        recentCommits.forEach((commit, index) => {
          const firstLine = commit.message.split('\n')[0]
          LoggerService.debug(`${index + 1}. ${firstLine}`)
        })
      }

      const goodExamples = recentCommits
        .filter((commit) => {
          const firstLine = commit.message.split('\n')[0]
          const strictMatch =
            /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?: .+/.test(
              firstLine
            )
          const lenientMatch =
            /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)[:\s].+/.test(
              firstLine
            )

          const matches = strictMatch || lenientMatch
          LoggerService.debug(
            `Checking: "${firstLine}" -> ${matches ? 'MATCH' : 'NO MATCH'}`
          )

          return matches
        })
        .slice(0, 3)

      LoggerService.debug(
        `\n📊 Filtered to ${goodExamples.length} good examples`
      )

      if (goodExamples.length > 0) {
        parts.push('Recent commits (style only):')
        goodExamples.forEach((commit) => {
          const shortMessage = commit.message.split('\n')[0]
          parts.push(`- ${shortMessage}`)
        })
      } else if (recentCommits.length > 0) {
        LoggerService.debug(
          '\n⚠️  No conventional commits found in recent history'
        )
      }
    }

    const nameStatus = diff.signals?.nameStatus || []
    const numStat = diff.signals?.numStat || []
    const topFiles = diff.signals?.topFiles || []
    const patchSnippets = diff.signals?.patchSnippets || []

    const scopeHint = this.scopeInferrer.infer(
      topFiles.length > 0
        ? topFiles
        : nameStatus.map((entry) => entry.path)
    )
    if (scopeHint) {
      parts.push(`Scope hint: ${scopeHint}`)
    }

    if (this.heuristics.isDocsOnlyChange(diff)) {
      parts.push('Type hint: docs (documentation-only change)')
      parts.push(`Scope hint: ${this.heuristics.getDocsScope(diff)}`)
    }

    if (this.heuristics.isDocsOnlyChange(diff)) {
      parts.push('Type hint: docs (documentation-only change)')
      parts.push(`Scope hint: ${this.heuristics.getDocsScope(diff)}`)
    } else if (this.heuristics.isInternalToolingChange(diff)) {
      parts.push('Type hint: refactor (internal tooling change)')
    }

    if (this.heuristics.isDocsTouched(diff) && !this.heuristics.isDocsOnlyChange(diff)) {
      const docsTouched = this.heuristics.getDocsTouchedList(diff).slice(0, 3)
      if (docsTouched.length > 0) {
        parts.push(`Docs touched: ${docsTouched.join(', ')}`)
      }
    }

    if (nameStatus.length > 0) {
      parts.push('Changes (name-status):')
      nameStatus.forEach((entry) => {
        if (entry.status === 'R' || entry.status === 'C') {
          const oldPath = entry.oldPath || 'unknown'
          parts.push(`- ${entry.status} ${oldPath} -> ${entry.path}`)
        } else {
          parts.push(`- ${entry.status} ${entry.path}`)
        }
      })
    }

    parts.push('Stats:')
    parts.push(`- files: ${diff.stats.filesChanged}`)
    parts.push(`- insertions: ${diff.stats.additions}`)
    parts.push(`- deletions: ${diff.stats.deletions}`)

    if (topFiles.length > 0) {
      parts.push('Top changes:')
      topFiles.forEach((path) => {
        const stats = numStat.find((entry) => entry.path === path)
        if (stats) {
          parts.push(`- ${path} (+${stats.insertions}/-${stats.deletions})`)
        } else {
          parts.push(`- ${path}`)
        }
      })
    }

    if (patchSnippets.length > 0) {
      parts.push('Top diffs (snippets):')
      patchSnippets.slice(0, 3).forEach((snippet) => {
        parts.push(snippet)
      })
    } else if (diff.summary) {
      parts.push('Summary:')
      parts.push(diff.summary)
    }

    return parts.join('\n')
  }

  /**
   * Builds a prompt for branch name generation.
   *
   * @param context - User-provided context
   * @param diff - Optional processed diff
   * @returns The prompt string
   */
  async buildBranchPrompt(
    context: string,
    diff?: ProcessedDiff
  ): Promise<string> {
    const prefixHint = this.inferBranchPrefix(context)
    const parts = ['Generate a branch name based on the following context:']
    parts.push(`\nContext: ${context}`)
    parts.push(`\nPrefix hint: ${prefixHint}`)

    if (diff) {
      parts.push('\nChanges summary:')
      parts.push(this.buildBranchDiffSummary(diff))
    }

    return parts.join('\n')
  }

  /**
   * Builds a prompt for pull request title and description generation.
   *
   * @param context - Optional user-provided context
   * @param diff - Processed branch diff
   * @param baseBranch - Optional base branch name
   * @returns The prompt string
   */
  async buildPullRequestPrompt(
    context: string | undefined,
    diff: ProcessedDiff,
    baseBranch?: string,
    hints?: {
      type?: string
      scope?: string
      template?: string
      platform?: string[]
      riskLevel?: string
      groupings?: string[]
      testTouched?: boolean
      uiTouched?: boolean
      commitSubjects?: string[]
    }
  ): Promise<string> {
    const parts: string[] = [
      'Generate a pull request title and description for the branch changes below.',
      'Title format: <type>(<scope>): <outcome>.',
      'Use the shortest template that preserves clarity.',
      'Use Markdown headings with "###" and bullet lists.',
      'Group headings must be product/feature areas, not files or code layers.',
      'QA Focus bullets must start with a surface like "CLI: ..." or "UI: ..." and be executable checks.',
    ]

    const branchName = await this.git.getBranchName()
    if (branchName) {
      parts.push(`Branch: ${branchName}`)
    }
    if (baseBranch) {
      parts.push(`Base: ${baseBranch}`)
    }

    if (context) {
      parts.push('User context:')
      parts.push(context)
    }

    if (hints?.type) {
      parts.push(`Type hint: ${hints.type}`)
    }
    if (hints?.scope) {
      parts.push(`Scope hint: ${hints.scope}`)
    }
    if (hints?.platform && hints.platform.length > 0) {
      parts.push(`Platform hints: ${hints.platform.join(', ')}`)
    }
    if (hints?.riskLevel) {
      parts.push(`Risk level: ${hints.riskLevel}`)
    }
    if (hints?.template) {
      parts.push(`Template: ${hints.template} (do not change)`)
    }
    if (hints?.groupings && hints.groupings.length > 0) {
      parts.push(`Grouping areas: ${hints.groupings.join(', ')}`)
    }
    if (hints?.testTouched) {
      parts.push('Tests touched: yes')
    }
    if (hints?.uiTouched) {
      parts.push('UI touched: yes')
    }
    if (hints?.commitSubjects && hints.commitSubjects.length > 0) {
      parts.push('Commit subjects (most recent first):')
      hints.commitSubjects.slice(0, 12).forEach((subject) => {
        parts.push(`- ${subject}`)
      })
    }

    const nameStatus = diff.signals?.nameStatus || []
    const numStat = diff.signals?.numStat || []
    const topFiles = diff.signals?.topFiles || []
    const patchSnippets = diff.signals?.patchSnippets || []

    parts.push('Stats:')
    parts.push(`- files: ${diff.stats.filesChanged}`)
    parts.push(`- insertions: ${diff.stats.additions}`)
    parts.push(`- deletions: ${diff.stats.deletions}`)

    if (topFiles.length > 0) {
      parts.push('Top changes:')
      topFiles.forEach((path) => {
        const stats = numStat.find((entry) => entry.path === path)
        if (stats) {
          parts.push(`- ${path} (+${stats.insertions}/-${stats.deletions})`)
        } else {
          parts.push(`- ${path}`)
        }
      })
    }

    if (nameStatus.length > 0) {
      parts.push('Changes (name-status):')
      nameStatus.slice(0, 12).forEach((entry) => {
        if (entry.status === 'R' || entry.status === 'C') {
          const oldPath = entry.oldPath || 'unknown'
          parts.push(`- ${entry.status} ${oldPath} -> ${entry.path}`)
        } else {
          parts.push(`- ${entry.status} ${entry.path}`)
        }
      })
      if (nameStatus.length > 12) {
        parts.push(`- ... +${nameStatus.length - 12} more`)
      }
    }

    if (patchSnippets.length > 0) {
      parts.push('Top diffs (snippets):')
      patchSnippets.slice(0, 3).forEach((snippet) => {
        parts.push(snippet)
      })
    } else if (diff.summary) {
      parts.push('Summary:')
      parts.push(diff.summary)
    }

    return parts.join('\n')
  }

  /**
   * Detects merge information from the diff.
   *
   * @param diff - The processed diff
   * @param userMessage - Optional user message
   * @param isMerge - Whether explicitly marked as merge
   * @returns Merge information
   */
  private async detectMergeInfo(
    diff: ProcessedDiff,
    userMessage?: string,
    isMerge: boolean = false
  ): Promise<{
    isMerge: boolean
    mergeInfo?: string[]
    sourceBranch?: string
    targetBranch?: string
  }> {
    if (!isMerge) {
      return { isMerge: false }
    }

    const mergeInfo: string[] = []
    let sourceBranch: string | undefined
    let targetBranch: string | undefined

    // Try to get source and target branches
    try {
      const mergeHeads = await this.git.getMergeHeads()
      if (mergeHeads.source && mergeHeads.target) {
        sourceBranch = mergeHeads.source
        targetBranch = mergeHeads.target
        mergeInfo.push(`Merging from ${sourceBranch} into ${targetBranch}`)
      }
    } catch (error) {
      LoggerService.debug(`Could not determine merge branches: ${error}`)
    }

    // For merge commits, we'll just state it's a clean merge
    mergeInfo.push('\nClean merge with no conflicts')

    return { isMerge, mergeInfo, sourceBranch, targetBranch }
  }

  /**
   * Builds a summary of diff for branch prompts.
   *
   * @param diff - The processed diff
   * @returns Summary string
   */
  private buildBranchDiffSummary(diff: ProcessedDiff): string {
    const nameStatus = diff.signals?.nameStatus || []
    const numStat = diff.signals?.numStat || []
    const topFiles = diff.signals?.topFiles || []

    const parts: string[] = []

    if (nameStatus.length > 0 && topFiles.length === 0) {
      const maxEntries = 10
      const shown = nameStatus.slice(0, maxEntries)
      parts.push('Name-status:')
      shown.forEach((entry) => {
        if (entry.status === 'R' || entry.status === 'C') {
          const oldPath = entry.oldPath || 'unknown'
          parts.push(`- ${entry.status} ${oldPath} -> ${entry.path}`)
        } else {
          parts.push(`- ${entry.status} ${entry.path}`)
        }
      })
      if (nameStatus.length > maxEntries) {
        parts.push(`- ... +${nameStatus.length - maxEntries} more`)
      }
    }

    parts.push('Stats:')
    parts.push(`- files: ${diff.stats.filesChanged}`)
    parts.push(`- insertions: ${diff.stats.additions}`)
    parts.push(`- deletions: ${diff.stats.deletions}`)

    if (topFiles.length > 0) {
      parts.push('Top files:')
      topFiles.forEach((path) => {
        const stats = numStat.find((entry) => entry.path === path)
        if (stats) {
          parts.push(`- ${path} (+${stats.insertions}/-${stats.deletions})`)
        } else {
          parts.push(`- ${path}`)
        }
      })
    }

    return parts.join('\n')
  }

  /**
   * Infers the branch prefix from context.
   *
   * @param context - User context
   * @returns Branch prefix
   */
  private inferBranchPrefix(context: string): string {
    const text = context.toLowerCase()
    if (/(fix|bug|crash|broken|regression)/.test(text)) return 'fix/'
    if (/(refactor|cleanup|rename|restructure)/.test(text))
      return 'refactor/'
    if (/(docs|readme|changelog)/.test(text)) return 'docs/'
    if (/(style|format|lint|eslint|prettier)/.test(text)) return 'style/'
    return 'feat/'
  }
}
