import OpenAI from 'openai'
import { Config, ProcessedDiff, CommitMessage } from '../types'
import LoggerService from './Logger.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import GitService from './Git.service'
import { GitCommit } from './Git.service'
import { COMMIT_MESSAGE_SYSTEM_CONTENT } from '../constants/openai.constants'

type OpenAIConfig = Config['openai']

interface OpenAIOptions {
  context?: boolean
  noAutoStage?: boolean
  merge?: boolean
}

/**
 * Service for interacting with OpenAI to generate commit messages.
 */
export class OpenAIService {
  private client: OpenAI
  private config: OpenAIConfig
  private options: OpenAIOptions

  constructor(config: OpenAIConfig, options: OpenAIOptions) {
    this.config = config
    this.client = new OpenAI({ apiKey: config.apiKey })
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
    hadConflicts?: boolean
    conflictFiles?: string[]
  }> {
    // First check if it's explicitly marked as a merge
    if (isMerge) {
      LoggerService.debug('Merge explicitly specified via --merge flag')
    } else {
      // If not explicitly marked, only check for active merge state (MERGE_HEAD)
      try {
        isMerge = await GitService.isMergingBranch()
        if (isMerge) {
          LoggerService.debug('Active merge detected (MERGE_HEAD exists)')
        }
      } catch (error) {
        LoggerService.debug(`Error detecting merge state: ${error}`)
      }
    }

    if (!isMerge) {
      return { isMerge: false }
    }

    const mergeInfo: string[] = []
    let sourceBranch: string | undefined
    let targetBranch: string | undefined
    let hadConflicts = false
    const conflictFiles: string[] = []

    // Try to get source and target branches
    try {
      const mergeHeads = await GitService.getMergeHeads()
      if (mergeHeads.source && mergeHeads.target) {
        sourceBranch = mergeHeads.source
        targetBranch = mergeHeads.target
        // Use more descriptive format for merge message
        if (sourceBranch === 'main' || sourceBranch === 'master') {
          mergeInfo.push(`Merging latest changes from ${sourceBranch} into ${targetBranch}`)
        } else {
          mergeInfo.push(`Merging ${sourceBranch} branch into ${targetBranch}`)
        }
      } else {
        LoggerService.debug('Could not determine merge branches, using generic message')
        mergeInfo.push('Merging branch changes')
      }
    } catch (error) {
      LoggerService.debug(`Could not determine merge branches: ${error}`)
      mergeInfo.push('Merging branch changes')
    }

    // Detect conflicts by looking for conflict markers in the diff
    const conflictMarkerRegex = /^[<>=]{7}/m
    const fileHeaderRegex = /^diff --git a\/(.*) b\/(.*)/m
    
    let currentFile: string | null = null
    const lines = diff.summary.split('\n')
    
    for (const line of lines) {
      const fileMatch = line.match(fileHeaderRegex)
      if (fileMatch) {
        currentFile = fileMatch[1]
        continue
      }
      
      if (currentFile && conflictMarkerRegex.test(line)) {
        hadConflicts = true
        if (!conflictFiles.includes(currentFile)) {
          conflictFiles.push(currentFile)
        }
      }
    }

    // Check for .git/MERGE_MSG which indicates there were conflicts
    try {
      const mergeMsgExists = await GitService.isMergingBranch()
      if (mergeMsgExists) {
        hadConflicts = true
      }
    } catch (error) {
      LoggerService.debug('Could not check for MERGE_MSG file')
    }

    if (hadConflicts) {
      mergeInfo.push('Merge had conflicts that were resolved in these files:')
      const files = conflictFiles as string[] | undefined
      if (files?.length) {
        files.forEach(file => mergeInfo.push(`- ${file}`))
      } else {
        mergeInfo.push('(Specific files with conflicts could not be determined)')
      }
    } else {
      mergeInfo.push('Clean merge with no conflicts')
    }

    return { 
      isMerge, 
      mergeInfo, 
      sourceBranch, 
      targetBranch,
      hadConflicts,
      conflictFiles 
    }
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

  /**
   * Builds the prompt for the OpenAI API.
   *
   * @param diff - The diff to generate a commit message for.
   * @param userMessage - Optional user-provided message for guidance.
   * @returns The prompt for the OpenAI API.
   */
  private async buildPrompt(
    diff: ProcessedDiff,
    userMessage?: string
  ): Promise<string> {
    const parts = ['Generate a commit message for the following changes:']

    // If user provided context, add it first with strong emphasis
    if (userMessage) {
      parts.push('\n=== USER CONTEXT - PLEASE PRIORITIZE THIS GUIDANCE ===')
      parts.push('The user has provided specific guidance for this commit message:')
      parts.push(userMessage)
      parts.push('Please ensure the commit message primarily reflects this guidance while accurately describing the changes.')
      parts.push('=== END USER CONTEXT ===\n')
    }

    // Add branch context
    const branchName = await GitService.getBranchName()
    parts.push(`\nCurrent branch: ${branchName}`)

    // Process diff to remove binary content
    const processedDiff = this.processDiffContent(diff)

    // Check if this is a merge commit
    const {
      isMerge: confirmed,
      mergeInfo,
      sourceBranch,
      targetBranch,
      hadConflicts,
      conflictFiles
    } = await this.detectMergeInfo(
      processedDiff,
      userMessage,
      this.options.merge
    )

    if (confirmed) {
      parts.push('\n=== MERGE COMMIT INFORMATION ===')
      parts.push('This is a merge commit - use conventional commits format:')
      parts.push('Type: chore')
      parts.push('Scope: merge')
      if (sourceBranch && targetBranch) {
        // Use more descriptive format for merge message
        if (sourceBranch === 'main' || sourceBranch === 'master') {
          parts.push(`\nMerging latest changes from ${sourceBranch} into ${targetBranch}`)
        } else {
          parts.push(`\nMerging ${sourceBranch} branch into ${targetBranch}`)
        }
      }
      if (mergeInfo) {
        parts.push('\nMerge details:')
        parts.push(...mergeInfo)
      }
      if (hadConflicts) {
        parts.push('\nConflict Resolution:')
        if (conflictFiles?.length) {
          parts.push(`${conflictFiles.length} files had conflicts that were resolved:`)
          conflictFiles.forEach(file => parts.push(`- ${file}`))
        } else {
          parts.push('Merge had conflicts that were resolved (specific files could not be determined)')
        }
      }
      parts.push('=== END MERGE INFORMATION ===\n')
    }

    // Add recent commits context, but with clear instruction
    const recentCommits = await GitService.getRecentCommits(5)
    if (recentCommits.length > 0) {
      parts.push(
        '\nRecent commits (for context only, do not reference unless directly relevant):'
      )
      recentCommits.forEach((commit: GitCommit) => {
        parts.push(
          `${commit.hash} (${commit.date}): ${commit.message}${
            commit.refs ? ` ${commit.refs}` : ''
          }`
        )
      })
    }

    // Add diff information with clear priority
    parts.push('\nCurrent changes (use these to support the user context):')
    if (processedDiff.stats.wasSummarized) {
      parts.push(processedDiff.summary)
      parts.push(`\nFiles changed: ${processedDiff.stats.filesChanged}`)
      parts.push(`Additions: ${processedDiff.stats.additions}`)
      parts.push(`Deletions: ${processedDiff.stats.deletions}`)
    } else {
      parts.push('\nRaw diff:')
      parts.push(processedDiff.summary)
    }

    return parts.join('\n')
  }

  /**
   * Parses the commit message from the OpenAI response.
   *
   * @param content - The content of the OpenAI response.
   * @returns The commit message.
   */
  private parseCommitMessage(content: string): CommitMessage {
    // First, strip any backticks, markdown, or other formatting
    const cleanContent = content
      .replace(/`/g, '') // Remove backticks
      .replace(/\*\*/g, '') // Remove bold markdown
      .replace(/\*/g, '') // Remove italic markdown
      .replace(/^#+\s*/gm, '') // Remove heading markers
      .replace(/^\s*[-*]\s*/gm, '- ') // Normalize list markers to '-'
      .trim()

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

    const prompt = await this.buildPrompt(diff, userMessage)

    // Log model info
    LoggerService.debug(`\n🤖 Model: ${this.config.model}`)

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          COMMIT_MESSAGE_SYSTEM_CONTENT +
          (userMessage
            ? '\nA user message has been provided as guidance. Consider it strongly for the commit message, but ensure the message accurately reflects the actual changes.'
            : ''),
      },
      {
        role: 'user',
        content: prompt,
      },
    ]

    LoggerService.debug('\n🔍 Building OpenAI Request:')
    LoggerService.debug(`Model: ${this.config.model}`)
    LoggerService.debug(`Max Tokens: ${this.config.maxTokens}`)
    LoggerService.debug(`Temperature: ${this.config.temperature}`)
    LoggerService.debug('Messages:')
    LoggerService.debug(`system: ${messages[0].content}`)
    LoggerService.debug('user: <diff content omitted>')

    LoggerService.debug('\n📤 Sending request to OpenAI...')

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      frequency_penalty: this.config.frequencyPenalty,
      presence_penalty: this.config.presencePenalty,
    })

    LoggerService.info(`🔍 Total Tokens: ${response.usage?.total_tokens}`)

    LoggerService.debug('\n📥 Received response from OpenAI:')
    LoggerService.debug(JSON.stringify(response, null, 2))

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No commit message generated')
    }

    return this.parseCommitMessage(content)
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
        temperature: 0.3, // Lower temperature for more focused names
        max_tokens: 60,
        top_p: this.config.topP,
        frequency_penalty: this.config.frequencyPenalty,
        presence_penalty: this.config.presencePenalty,
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
  config: OpenAIConfig,
  options: OpenAIOptions
): OpenAIService => {
  return new OpenAIService(config, options)
}
