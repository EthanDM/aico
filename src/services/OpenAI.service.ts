import OpenAI from 'openai'
import { Config, ProcessedDiff, CommitMessage } from '../types'
import LoggerService from './Logger.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import GitService from './Git.service'
import { COMMIT_MESSAGE_SYSTEM_CONTENT } from '../constants/openai.constants'

type OpenAIConfig = Config['openai']
type CommitConfig = Config['commit']

const PATH_SCOPE_MAP = [
  { scope: 'services', match: /^src\/services\// },
  { scope: 'processors', match: /^src\/processors\// },
  { scope: 'constants', match: /^src\/constants\// },
  { scope: 'types', match: /^src\/types\// },
  { scope: 'cli', match: /^src\/cli\.ts$/ },
  { scope: 'config', match: /^(config\.|\.config\.|tsconfig\.|package\.json)/ },
]

const SUBJECT_PATTERN =
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: .+$/

const BANNED_SUBJECT_WORDS = [
  'update',
  'updates',
  'updated',
  'enhance',
  'enhanced',
  'improve',
  'improved',
  'misc',
  'changes',
]

const VAGUE_SUBJECT_PATTERNS = [
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: changes$/i,
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: minor changes$/i,
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: various changes$/i,
]

interface OpenAIOptions {
  context?: boolean | string
  noAutoStage?: boolean
  merge?: boolean
}

/**
 * Service for interacting with OpenAI to generate commit messages.
 */
export class OpenAIService {
  private client: OpenAI
  private config: OpenAIConfig
  private commitConfig: CommitConfig
  private options: OpenAIOptions

  constructor(config: Config, options: OpenAIOptions) {
    this.config = config.openai
    this.commitConfig = config.commit
    this.client = new OpenAI({ apiKey: this.config.apiKey })
    this.options = options
  }

  /**
   * Detects if this is a merge commit and extracts conflict information.
   *
   * @param diff - The processed diff
   * @param userMessage - Optional user-provided message for guidance
   * @param isMerge - Whether this is explicitly a merge commit
   * @returns Information about the merge and conflicts, if any
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
      const mergeHeads = await GitService.getMergeHeads()
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
   * Checks if a file appears to be binary/media content.
   *
   * @param filename - The filename to check
   * @returns True if the file appears to be binary/media
   */
  private isBinaryOrMediaFile(filename: string): boolean {
    const binaryExtensions = [
      // Video
      'mp4',
      'mov',
      'avi',
      'mkv',
      'wmv',
      // Images
      'png',
      'jpg',
      'jpeg',
      'gif',
      'bmp',
      'ico',
      'svg',
      'webp',
      // Audio
      'mp3',
      'wav',
      'ogg',
      'm4a',
      // Documents
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      // Archives
      'zip',
      'rar',
      'tar',
      'gz',
      '7z',
      // Other binaries
      'exe',
      'dll',
      'so',
      'dylib',
      'bin',
      // Font files
      'ttf',
      'otf',
      'woff',
      'woff2',
    ]
    const ext = filename.split('.').pop()?.toLowerCase()
    return ext ? binaryExtensions.includes(ext) : false
  }

  /**
   * Filters and processes the diff summary to exclude binary/media content.
   *
   * @param diff - The original diff
   * @returns Processed diff with binary content removed
   */
  private processDiffContent(diff: ProcessedDiff): ProcessedDiff {
    const lines = diff.summary.split('\n')
    const filteredLines: string[] = []
    let skipCurrentFile = false

    for (const line of lines) {
      // Check for file headers in diff
      if (line.startsWith('diff --git')) {
        const filename = line.split(' ').pop()?.replace('b/', '') ?? ''
        skipCurrentFile = this.isBinaryOrMediaFile(filename)
        if (skipCurrentFile) {
          filteredLines.push(`Skipped binary/media file: ${filename}`)
          continue
        }
      }

      // Skip lines if we're in a binary file section
      if (skipCurrentFile) {
        if (line.startsWith('diff --git')) {
          skipCurrentFile = false // Reset for next file
        } else {
          continue
        }
      }

      filteredLines.push(line)
    }

    return {
      ...diff,
      summary: filteredLines.join('\n'),
    }
  }

  private shouldIncludeBody(
    mode: CommitConfig['includeBody'],
    stats: ProcessedDiff['stats'],
    userMessage?: string
  ): boolean {
    if (mode === 'always') {
      return true
    }
    if (mode === 'never') {
      return false
    }

    const linesChanged = stats.additions + stats.deletions
    const hasUserContext = Boolean(userMessage && userMessage.trim())
    return (
      stats.filesChanged >= 4 || linesChanged >= 150 || hasUserContext
    )
  }

  private isInternalToolingChange(diff: ProcessedDiff): boolean {
    const paths = diff.signals?.topFiles?.length
      ? diff.signals.topFiles
      : diff.signals?.nameStatus?.map((entry) => entry.path) || []
    if (paths.length === 0) {
      return false
    }

    const internalPrefixes = [
      'src/services/',
      'src/processors/',
      'src/types/',
      'src/constants/',
    ]
    const userFacingHints = ['src/cli.ts', 'src/cli/']

    const hasUserFacingHint = paths.some((path) =>
      userFacingHints.some((hint) => path.startsWith(hint))
    )
    if (hasUserFacingHint) {
      return false
    }

    const internalCount = paths.filter((path) =>
      internalPrefixes.some((prefix) => path.startsWith(prefix))
    ).length

    return internalCount / paths.length >= 0.5
  }

  private containsFilePathOrExtension(text: string): boolean {
    const hasPath =
      /[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+/.test(text) ||
      /[A-Za-z0-9._-]+\\[A-Za-z0-9._\\-]+/.test(text)
    const hasExtension = /\b[\w-]+\.[a-z][a-z0-9]{1,4}\b/i.test(text)
    return hasPath || hasExtension
  }

  private validateCommitMessage(
    message: CommitMessage,
    options: {
      maxTitleLength: number
      includeBodyMode: CommitConfig['includeBody']
      includeBodyAllowed: boolean
      internalChange?: boolean
    }
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const title = message.title.trim()

    if (!SUBJECT_PATTERN.test(title)) {
      errors.push('Subject must follow Conventional Commits format')
    }

    if (title.length > options.maxTitleLength) {
      errors.push(
        `Subject exceeds ${options.maxTitleLength} characters`
      )
    }

    if (this.containsFilePathOrExtension(title)) {
      errors.push('Subject must not include file paths or extensions')
    }

    const bannedSubjectPattern = new RegExp(
      `\\b(${BANNED_SUBJECT_WORDS.join('|')})\\b`,
      'i'
    )
    if (bannedSubjectPattern.test(title)) {
      errors.push('Subject contains banned filler words')
    }
    if (VAGUE_SUBJECT_PATTERNS.some((pattern) => pattern.test(title))) {
      errors.push('Subject is too vague')
    }

    if (options.internalChange && /^feat(\(|:)/.test(title)) {
      errors.push('Use refactor/chore for internal tooling changes (not feat)')
    }

    if (message.body) {
      if (
        options.includeBodyMode === 'never' ||
        !options.includeBodyAllowed
      ) {
        errors.push('Body is not allowed for this commit')
      }

      const bodyLines = message.body
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      if (bodyLines.length > 2) {
        errors.push('Body must be 2 bullets or fewer')
      }

      if (bodyLines.some((line) => !line.startsWith('- '))) {
        errors.push('Body bullets must start with "- "')
      }

      const narrationWords = [
        'update',
        'updated',
        'modify',
        'modified',
        'change',
        'changed',
        'refactor',
        'refactored',
        'adjust',
        'adjusted',
        'cleanup',
        'cleaned',
      ]
      const narrationPattern = new RegExp(
        `\\b(${narrationWords.join('|')})\\b`,
        'i'
      )
      if (bodyLines.some((line) => narrationPattern.test(line))) {
        errors.push('Body notes must avoid narration words')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Builds the prompt for the OpenAI API.
   *
   * @param diff - The diff to generate a commit message for.
   * @param userMessage - Optional user-provided message for guidance.
   * @param includeBodyAllowed - Whether a body is allowed for this commit.
   * @param includeBodyMode - The includeBody policy mode.
   * @returns The prompt for the OpenAI API.
   */
  private async buildPrompt(
    diff: ProcessedDiff,
    userMessage: string | undefined,
    includeBodyAllowed: boolean,
    includeBodyMode: CommitConfig['includeBody']
  ): Promise<string> {
    const parts: string[] = [
      'Generate a conventional commit message for the changes below.',
    ]

    // Add branch context for scope hints
    const branchName = await GitService.getBranchName()
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
    } = await this.detectMergeInfo(
      diff,
      userMessage,
      this.options.merge
    )

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
    if (userMessage) {
      parts.push('User context:')
      parts.push(userMessage)
    }

    if (includeBodyMode === 'never') {
      parts.push('Body is not allowed for this commit.')
    } else if (!includeBodyAllowed) {
      parts.push('Return only the subject line.')
    }

    parts.push(`Max subject length: ${this.commitConfig.maxTitleLength} characters.`)

    if (includeBodyMode === 'always') {
      const recentCommits = await GitService.getRecentCommits(5)

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

    const scopeHint = this.inferScopeFromPaths(
      topFiles.length > 0
        ? topFiles
        : nameStatus.map((entry) => entry.path)
    )
    if (scopeHint) {
      parts.push(`Scope hint: ${scopeHint}`)
    }

    if (this.isInternalToolingChange(diff)) {
      parts.push('Type hint: refactor (internal tooling change)')
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
   * Sanitizes the commit message by converting scopes to lowercase kebab-case.
   *
   * @param message - The commit message to sanitize
   * @returns The sanitized commit message
   */
  private sanitizeCommitMessage(message: string): string {
    return message.replace(/^\w+\(([^)]+)\):/, (match, scope) => {
      // Convert PascalCase/camelCase to kebab-case and lowercase
      const kebabScope = scope
        .replace(/([a-z])([A-Z])/g, '$1-$2') // Convert camelCase
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2') // Convert PascalCase
        .toLowerCase()
      return match.replace(scope, kebabScope)
    })
  }

  private inferScopeFromPaths(paths: string[]): string | undefined {
    const counts = new Map<string, number>()

    for (const path of paths) {
      for (const entry of PATH_SCOPE_MAP) {
        if (entry.match.test(path)) {
          counts.set(entry.scope, (counts.get(entry.scope) || 0) + 1)
        }
      }
    }

    const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
    return best?.[0]
  }

  private normalizeSubject(candidate: string): string {
    return candidate.split('\n')[0]?.replace(/\s+/g, ' ').trim() || ''
  }

  private isValidSubject(subject: string, maxLength: number): boolean {
    if (!subject || subject.length > maxLength) return false
    if (!SUBJECT_PATTERN.test(subject)) return false
    if (this.containsFilePathOrExtension(subject)) return false
    const bannedSubjectPattern = new RegExp(
      `\\b(${BANNED_SUBJECT_WORDS.join('|')})\\b`,
      'i'
    )
    if (bannedSubjectPattern.test(subject)) return false
    if (VAGUE_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject))) {
      return false
    }
    return true
  }

  private splitValidationErrors(errors: string[]): {
    structural: string[]
    style: string[]
  } {
    const structural: string[] = []
    const style: string[] = []

    errors.forEach((error) => {
      if (
        error.includes('Conventional Commits format') ||
        error.includes('Use refactor/chore')
      ) {
        structural.push(error)
      } else {
        style.push(error)
      }
    })

    return { structural, style }
  }

  private stripFilePaths(text: string): string {
    let cleaned = text
    cleaned = cleaned.replace(/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+/g, '')
    cleaned = cleaned.replace(/[A-Za-z0-9._-]+\\[A-Za-z0-9._\\-]+/g, '')
    cleaned = cleaned.replace(/\b[\w-]+\.[a-z][a-z0-9]{1,4}\b/gi, '')
    return cleaned
  }

  private removeBannedWords(text: string): string {
    const bannedSubjectPattern = new RegExp(
      `\\b(${BANNED_SUBJECT_WORDS.join('|')})\\b`,
      'gi'
    )
    return text.replace(bannedSubjectPattern, '')
  }

  private repairSubject(
    diff: ProcessedDiff,
    candidate: string
  ): string | undefined {
    const maxLength = this.commitConfig.maxTitleLength
    const normalized = this.normalizeSubject(candidate)
    const match = normalized.match(SUBJECT_PATTERN)
    if (!match) {
      return undefined
    }

    const type = match[1]
    const scope = match[2] || ''
    let description = match[3]

    description = this.stripFilePaths(description)
    description = this.removeBannedWords(description)
    description = description.replace(/\s+/g, ' ').trim()
    description = description
      .replace(/\b(from|in|on|at|within|inside)\s*$/i, '')
      .trim()

    if (
      !description ||
      VAGUE_SUBJECT_PATTERNS.some((pattern) =>
        pattern.test(`${type}${scope}: ${description}`)
      )
    ) {
      description = 'align commit flow'
    }

    const subject = this.truncateSubjectToMax(
      `${type}${scope}: ${description}`,
      maxLength
    )

    if (!this.isValidSubject(subject, maxLength)) {
      return undefined
    }

    return subject
  }

  private truncateSubjectToMax(subject: string, maxLength: number): string {
    if (subject.length <= maxLength) return subject
    const match = subject.match(
      /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([^)]+\))?: (.+)$/
    )
    if (!match) {
      return subject.slice(0, maxLength).trim()
    }

    const type = match[1]
    const scope = match[2] || ''
    const description = match[3]
    const prefix = `${type}${scope}: `
    const allowed = Math.max(0, maxLength - prefix.length)

    if (allowed === 0) {
      return `${type}: align commit flow`.slice(0, maxLength).trim()
    }

    const rawSlice = description.slice(0, allowed)
    const lastSpaceIndex = rawSlice.lastIndexOf(' ')
    const candidate =
      lastSpaceIndex > 0 ? rawSlice.slice(0, lastSpaceIndex).trim() : rawSlice.trim()
    const cleaned = candidate.replace(/[-:,.]+$/, '').trim()
    return `${prefix}${cleaned}`.trim()
  }

  private buildSafeFallbackSubject(
    diff: ProcessedDiff,
    candidate?: string
  ): string {
    const maxLength = this.commitConfig.maxTitleLength
    const candidateSubject = candidate
      ? this.normalizeSubject(candidate)
      : ''

    if (this.isValidSubject(candidateSubject, maxLength)) {
      return candidateSubject
    }

    const truncatedCandidate = this.truncateSubjectToMax(
      candidateSubject,
      maxLength
    )
    if (this.isValidSubject(truncatedCandidate, maxLength)) {
      return truncatedCandidate
    }

    const scopeHint = this.inferScopeFromPaths(
      diff.signals?.topFiles?.length
        ? diff.signals.topFiles
        : diff.signals?.nameStatus?.map((entry) => entry.path) || []
    )

    const baseDescription = 'align commit flow'
    const preferredType = scopeHint ? 'refactor' : 'chore'
    const scoped = scopeHint
      ? `${preferredType}(${scopeHint}): ${baseDescription}`
      : `${preferredType}: ${baseDescription}`

    const scopedTruncated = this.truncateSubjectToMax(scoped, maxLength)
    if (this.isValidSubject(scopedTruncated, maxLength)) {
      return scopedTruncated
    }

    const fallback = `chore: ${baseDescription}`
    const fallbackTruncated = this.truncateSubjectToMax(fallback, maxLength)
    if (this.isValidSubject(fallbackTruncated, maxLength)) {
      return fallbackTruncated
    }

    return 'chore: align commit flow'
  }

  /**
   * Parses the commit message from the OpenAI response.
   *
   * @param content - The content of the OpenAI response.
   * @returns The commit message.
   */
  private parseCommitMessage(content: string): CommitMessage {
    // First, strip any backticks, markdown, or other formatting
    let cleanContent = content
      .replace(/`/g, '') // Remove backticks
      .replace(/\*\*/g, '') // Remove bold markdown
      .replace(/\*/g, '') // Remove italic markdown
      .replace(/^#+\s*/gm, '') // Remove heading markers
      .replace(/^\s*[-*]\s*/gm, '- ') // Normalize list markers to '-'
      .trim()

    // Sanitize the commit message to ensure lowercase scopes
    cleanContent = this.sanitizeCommitMessage(cleanContent)

    const lines = cleanContent.split('\n')
    const title = lines[0].trim()

    // Find the body (everything after the title and first empty line)
    const bodyLines: string[] = []
    let bodyStarted = false

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()

      // Skip empty lines until we find content
      if (!bodyStarted && !line) {
        continue
      }

      // Start collecting body content
      if (line) {
        bodyStarted = true
        bodyLines.push(line)
      } else if (bodyStarted) {
        // Keep empty lines that are between body paragraphs
        bodyLines.push('')
      }
    }

    // Remove trailing empty lines from body
    while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1]) {
      bodyLines.pop()
    }

    return {
      title,
      body: bodyLines.length > 0 ? bodyLines.join('\n') : undefined,
    }
  }

  /**
   * Generates a commit message for the given diff.
   *
   * @param diff - The diff to generate a commit message for.
   * @param userMessage - Optional user-provided message for guidance.
   * @param isMerge - Whether this is a merge commit.
   * @returns The commit message.
   */
  public async generateCommitMessage(
    diff: ProcessedDiff,
    userMessage?: string,
    isMerge: boolean = false
  ): Promise<CommitMessage> {
    // Check for very large diffs
    const LARGE_DIFF_THRESHOLD = 30000 // characters
    if (
      diff.summary.length > LARGE_DIFF_THRESHOLD &&
      !this.config.model.includes('mini') &&
      !this.options.context // If we're not prompting for context, treat it like auto mode
    ) {
      LoggerService.warn('\n⚠️  Large diff detected!')
      LoggerService.info(
        `Size: ${Math.round(diff.summary.length / 1000)}K characters`
      )

      const { default: inquirer } = await import('inquirer')
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'This is a large diff. Consider:',
          choices: [
            {
              name: 'Continue with GPT-4o (better quality, slightly higher cost)',
              value: 'continue',
            },
            {
              name: 'Switch to GPT-4o-mini for this commit (faster, cheaper)',
              value: 'mini',
            },
            {
              name: 'Cancel (consider breaking into smaller commits)',
              value: 'cancel',
            },
          ],
        },
      ])

      if (action === 'cancel') {
        throw new Error(
          'Operation cancelled. Consider breaking changes into smaller, atomic commits.'
        )
      }

      if (action === 'mini') {
        this.config.model = 'gpt-4o-mini'
        LoggerService.info('Switched to GPT-4o-mini for this commit')
      }
    }

    const includeBodyAllowed = this.shouldIncludeBody(
      this.commitConfig.includeBody,
      diff.stats,
      userMessage
    )

    const prompt = await this.buildPrompt(
      diff,
      userMessage,
      includeBodyAllowed,
      this.commitConfig.includeBody
    )

    const baseMessages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: COMMIT_MESSAGE_SYSTEM_CONTENT,
      },
      {
        role: 'user',
        content: prompt,
      },
    ]

    const retryModel = this.config.model.includes('mini')
      ? 'gpt-4o'
      : this.config.model
    const retryTemperature = Math.min(this.config.temperature, 0.1)

    let lastMessage: CommitMessage | undefined
    let lastErrors: string[] = []

    for (let attempt = 0; attempt < 2; attempt++) {
      const isRetry = attempt === 1
      const model = isRetry ? retryModel : this.config.model
      const temperature = isRetry ? retryTemperature : this.config.temperature
      if (isRetry) {
        LoggerService.debug(
          `Retrying with ${model} due to validation failures: ${lastErrors.join(
            '; '
          )}`
        )
      }

      const messages: ChatCompletionMessageParam[] = isRetry
        ? [
            baseMessages[0],
            {
              role: 'user',
              content:
                `${prompt}\nPrevious output:\n${lastMessage?.title ?? ''}\n` +
                (lastMessage?.body ? `${lastMessage.body}\n` : '') +
                `Violations:\n- ${lastErrors.join('\n- ')}\nReturn only the corrected commit message.`,
            } as ChatCompletionMessageParam,
          ]
        : baseMessages

      LoggerService.debug('\n🔍 Building OpenAI Request:')
      LoggerService.debug(`Model: ${model}`)
      const maxCompletionTokens = isRetry
        ? Math.max(this.config.maxTokens, 350)
        : this.config.maxTokens
      LoggerService.debug(`Max Tokens: ${maxCompletionTokens}`)
      LoggerService.debug(`Temperature: ${temperature}`)
      LoggerService.debug('Messages:')
      LoggerService.debug(`system: ${messages[0].content}`)
      LoggerService.debug(`user: ${messages[1].content}`)

      LoggerService.debug('\n📤 Sending request to OpenAI...')

      const requestBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages,
        max_completion_tokens: maxCompletionTokens,
      }

      if (!model.startsWith('gpt-5')) {
        requestBody.temperature = temperature
        requestBody.top_p = this.config.topP
        requestBody.frequency_penalty = this.config.frequencyPenalty
        requestBody.presence_penalty = this.config.presencePenalty
      }

      const response = await this.client.chat.completions.create(requestBody)

      LoggerService.info(`🔍 Total Tokens: ${response.usage?.total_tokens}`)
      LoggerService.debug(
        `Finish reason: ${response.choices[0]?.finish_reason}`
      )

      LoggerService.debug('\n📥 Received response from OpenAI:')
      LoggerService.debug(JSON.stringify(response, null, 2))

      const rawContent = response.choices[0]?.message?.content || ''
      const content = rawContent.trim()
      const finishReason = response.choices[0]?.finish_reason
      if (!content) {
        if (isRetry) {
          break
        }
        if (lastMessage) {
          break
        }
        throw new Error('No commit message generated')
      }

      if (isRetry && finishReason !== 'stop') {
        break
      }

      const parsedMessage = this.parseCommitMessage(rawContent)
      lastMessage = parsedMessage

      const internalChange = this.isInternalToolingChange(diff)
      const truncatedSubjectOnly: CommitMessage = {
        title: this.truncateSubjectToMax(
          parsedMessage.title,
          this.commitConfig.maxTitleLength
        ),
        body: undefined,
      }
      const truncatedValidation = this.validateCommitMessage(
        truncatedSubjectOnly,
        {
          maxTitleLength: this.commitConfig.maxTitleLength,
          includeBodyMode: this.commitConfig.includeBody,
          includeBodyAllowed,
          internalChange,
        }
      )
      if (truncatedValidation.valid) {
        return truncatedSubjectOnly
      }

      const validation = this.validateCommitMessage(parsedMessage, {
        maxTitleLength: this.commitConfig.maxTitleLength,
        includeBodyMode: this.commitConfig.includeBody,
        includeBodyAllowed,
        internalChange,
      })

      if (validation.valid) {
        return parsedMessage
      }

      const subjectOnly: CommitMessage = {
        title: parsedMessage.title,
        body: undefined,
      }
      const subjectOnlyValidation = this.validateCommitMessage(subjectOnly, {
        maxTitleLength: this.commitConfig.maxTitleLength,
        includeBodyMode: this.commitConfig.includeBody,
        includeBodyAllowed,
        internalChange,
      })
      if (subjectOnlyValidation.valid) {
        return subjectOnly
      }

      const { structural } = this.splitValidationErrors(validation.errors)
      if (structural.length === 0) {
        const repaired = this.repairSubject(diff, parsedMessage.title)
        if (repaired) {
          LoggerService.debug(
            `Repaired subject locally: "${parsedMessage.title}" -> "${repaired}"`
          )
          return { title: repaired, body: undefined }
        }
        return {
          title: this.buildSafeFallbackSubject(diff, parsedMessage.title),
          body: undefined,
        }
      }

      const nonBodyErrors = validation.errors.filter(
        (error) => !error.startsWith('Body ')
      )
      const onlyTooLong =
        nonBodyErrors.length === 1 &&
        nonBodyErrors[0]?.includes('exceeds')
      if (onlyTooLong) {
        const truncated = this.truncateSubjectToMax(
          parsedMessage.title,
          this.commitConfig.maxTitleLength
        )
        const truncatedSubject: CommitMessage = {
          title: truncated,
          body: undefined,
        }
        const onlyTooLongValidation = this.validateCommitMessage(
          truncatedSubject,
          {
            maxTitleLength: this.commitConfig.maxTitleLength,
            includeBodyMode: this.commitConfig.includeBody,
            includeBodyAllowed,
            internalChange,
          }
        )
        if (onlyTooLongValidation.valid) {
          return truncatedSubject
        }
        return {
          title: this.buildSafeFallbackSubject(diff, parsedMessage.title),
          body: undefined,
        }
      }

      lastErrors = validation.errors
      LoggerService.debug(
        `Commit message validation failed: ${validation.errors.join('; ')}`
      )
    }

    return {
      title: this.buildSafeFallbackSubject(diff, lastMessage?.title),
      body: undefined,
    }
  }

  /**
   * Generates a branch name based on the provided context.
   *
   * @param context - User provided context for the branch name
   * @param diff - Optional diff to consider when generating the branch name
   * @returns The generated branch name
   */
  public async generateBranchName(
    context: string,
    diff?: ProcessedDiff
  ): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert at creating concise and meaningful git branch names.
Your task is to analyze the user's intent and create a short, focused branch name that captures the core purpose.

Follow these strict branch naming rules:
- Use kebab-case (lowercase with hyphens)
- Start with the most appropriate type prefix:
  * fix/ - for bug fixes and error corrections
  * feat/ - for new features and enhancements
  * refactor/ - for code restructuring
  * chore/ - for maintenance and tooling
  * style/ - for pure styling changes
  * docs/ - for documentation only
- Keep it VERY concise (max 40 characters including prefix)
- Focus on the core problem or feature
- Remove unnecessary context words (e.g. 'frontend', 'backend', 'server', 'client')
- Use clear, meaningful terms
- No special characters except hyphens and forward slashes

IMPORTANT:
1. Respond ONLY with the branch name, nothing else
2. Keep names SHORT - if you can say it in fewer words, do it
3. Remove any implementation details or technical context
4. Focus on WHAT is being done, not WHERE or HOW

Examples of good branch names:
✓ fix/lead-mapping-sensitivity
✓ feat/user-auth
✓ refactor/api-endpoints
✓ chore/eslint-rules

Examples of bad branch names:
✗ fix/frontend-lead-enrichment-mapping-sensitivity (too long)
✗ feat/add-new-user-authentication-system (too verbose)
✗ fix/backend-api-endpoint-error-handling (includes unnecessary context)
✗ chore/update-frontend-eslint-config (includes unnecessary location)`,
      },
      {
        role: 'user',
        content: await this.buildBranchPrompt(context, diff),
      },
    ]

    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        max_completion_tokens: 60,
        ...(this.config.model.startsWith('gpt-5')
          ? {}
          : {
            temperature: 0.3,
            top_p: this.config.topP,
            frequency_penalty: this.config.frequencyPenalty,
            presence_penalty: this.config.presencePenalty,
          }),
      })

      const response = completion.choices[0]?.message?.content?.trim() || ''

      // Extract just the branch name - take the first line and clean it
      const branchName = response
        .split('\n')[0]
        .trim()
        // Remove any quotes or backticks
        .replace(/[`'"]/g, '')
        // Replace any invalid characters with hyphens
        .replace(/[^a-z0-9/-]/g, '-')
        // Replace multiple consecutive hyphens with a single one
        .replace(/-+/g, '-')
        // Remove any leading or trailing hyphens
        .replace(/^-+|-+$/g, '')

      // Ensure it starts with a valid prefix if it doesn't already
      const validPrefixes = [
        'feat/',
        'fix/',
        'refactor/',
        'chore/',
        'style/',
        'docs/',
      ]
      if (!validPrefixes.some((prefix) => branchName.startsWith(prefix))) {
        // Default to chore/ if no valid prefix is present
        return 'chore/' + branchName
      }

      // Enforce maximum length by truncating if necessary
      const maxLength = 40
      if (branchName.length > maxLength) {
        const prefix = branchName.split('/')[0] + '/'
        const name = branchName.slice(prefix.length)
        const truncatedName = name.split('-').reduce((acc, part) => {
          if (
            (acc + (acc ? '-' : '') + part).length <=
            maxLength - prefix.length
          ) {
            return acc + (acc ? '-' : '') + part
          }
          return acc
        }, '')
        return prefix + truncatedName
      }

      return branchName
    } catch (error) {
      LoggerService.error('Failed to generate branch name')
      throw error
    }
  }

  /**
   * Builds the prompt for branch name generation.
   *
   * @param context - User provided context
   * @param diff - Optional diff to consider
   * @returns The prompt for the OpenAI API
   */
  private async buildBranchPrompt(
    context: string,
    diff?: ProcessedDiff
  ): Promise<string> {
    const parts = ['Generate a branch name based on the following context:']
    parts.push(`\nContext: ${context}`)

    if (diff) {
      parts.push('\nChanges summary:')
      if (diff.stats.wasSummarized) {
        parts.push(diff.summary)
        parts.push(`\nFiles changed: ${diff.stats.filesChanged}`)
        parts.push(`Additions: ${diff.stats.additions}`)
        parts.push(`Deletions: ${diff.stats.deletions}`)
      } else {
        parts.push(diff.summary)
      }
    }

    return parts.join('\n')
  }
}

/**
 * Creates and exports a new OpenAI service instance.
 *
 * @param config - The OpenAI configuration
 * @param options - Additional options for the OpenAI service
 * @returns An OpenAI service instance
 */
export const createOpenAIService = (
  config: Config,
  options: OpenAIOptions
): OpenAIService => {
  return new OpenAIService(config, options)
}
