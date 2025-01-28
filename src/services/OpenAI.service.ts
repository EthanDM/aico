import OpenAI from 'openai'
import { Config, ProcessedDiff, CommitMessage } from '../types'
import LoggerService from './Logger.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import GitService from './Git.service'
import { COMMIT_MESSAGE_SYSTEM_CONTENT } from '../constants/openai.constants'

type OpenAIConfig = Config['openai']

/**
 * Service for interacting with OpenAI to generate commit messages.
 */
class OpenAIService {
  private client: OpenAI
  private config: OpenAIConfig

  constructor(config: OpenAIConfig) {
    this.config = config
    this.client = new OpenAI({ apiKey: config.apiKey })
  }

  /**
   * Detects if this is a merge commit and extracts conflict information.
   *
   * @param diff - The processed diff
   * @param userMessage - Optional user-provided message for guidance
   * @returns Information about the merge and conflicts, if any
   */
  private async detectMergeInfo(
    diff: ProcessedDiff,
    userMessage?: string
  ): Promise<{ isMerge: boolean; mergeInfo?: string[] }> {
    // Only detect merge if user explicitly mentions it
    const isMerge = userMessage?.toLowerCase().includes('merge') ?? false

    if (!isMerge) {
      return { isMerge: false }
    }

    const mergeInfo: string[] = []

    // Look for conflict markers in the diff
    const conflictFiles = diff.summary
      .split('\n')
      .filter(
        (line) =>
          line.includes('<<<<<<<') ||
          line.includes('=======') ||
          line.includes('>>>>>>>')
      )
      .map((line) => {
        // Extract filename from diff line with more precise pattern
        const match = line.match(/^(?:---|\+\+\+)\s+(?:a\/|b\/)?(.+?)(?:\t|$)/)
        return match ? match[1] : null
      })
      .filter((file): file is string => file !== null)

    // Also look for typical merge resolution patterns
    const resolutionFiles = diff.summary
      .split('\n')
      .filter(
        (line) =>
          line.includes('Conflicts resolved in') ||
          line.includes('resolve conflict') ||
          line.includes('resolving conflict')
      )
      .map((line) => {
        const match = line.match(/(?:in|with)\s+([^\s]+)/)
        return match ? match[1] : null
      })
      .filter((file): file is string => file !== null)

    const allConflictFiles = [
      ...new Set([...conflictFiles, ...resolutionFiles]),
    ]

    if (allConflictFiles.length > 0) {
      mergeInfo.push('Files with resolved conflicts:')
      allConflictFiles.forEach((file) => {
        mergeInfo.push(`- ${file}`)
      })
    } else {
      mergeInfo.push('Clean merge with no conflicts')
    }

    return { isMerge, mergeInfo }
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

    // Add branch context
    const branchName = await GitService.getBranchName()
    parts.push(`\nCurrent branch: ${branchName}`)

    // Process diff to remove binary content
    const processedDiff = this.processDiffContent(diff)

    // Check if this is a merge commit (based on user context)
    const { isMerge, mergeInfo } = await this.detectMergeInfo(
      processedDiff,
      userMessage
    )
    if (isMerge) {
      parts.push('\nThis is a merge commit.')
      if (mergeInfo) {
        parts.push('\nMerge conflict information:')
        parts.push(...mergeInfo)
      }
    }

    // Add user guidance if provided
    if (userMessage) {
      parts.push('\nUser suggested message:')
      parts.push(userMessage)
      parts.push(
        '\nConsider the above message as guidance, but ensure the commit message accurately reflects the actual changes.'
      )
    }

    LoggerService.debug(`🔍 Current branch: ${branchName}`)

    // Add recent commits context
    const recentCommits = await GitService.getRecentCommits(5)
    if (recentCommits.length > 0) {
      parts.push('\nRecent commits for additional context:')
      recentCommits.forEach((commit) => {
        parts.push(
          `${commit.hash} (${commit.date}): ${commit.message}${
            commit.refs ? ` ${commit.refs}` : ''
          }`
        )
      })
    }

    LoggerService.debug('🔍 Recent commits:')
    LoggerService.debug(parts.join('\n'))

    // Add diff information
    parts.push('\nCurrent changes:')
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
    const lines = content.trim().split('\n')
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
   * @returns The commit message.
   */
  public async generateCommitMessage(
    diff: ProcessedDiff,
    userMessage?: string
  ): Promise<CommitMessage> {
    // Check for very large diffs
    const LARGE_DIFF_THRESHOLD = 30000 // characters
    if (
      diff.summary.length > LARGE_DIFF_THRESHOLD &&
      !this.config.model.includes('mini')
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
}

/**
 * Creates and exports a new OpenAI service instance.
 *
 * @param config - The OpenAI configuration
 * @returns An OpenAI service instance
 */
export const createOpenAIService = (config: OpenAIConfig): OpenAIService => {
  return new OpenAIService(config)
}
