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

    // Add user guidance if provided
    if (userMessage) {
      parts.push('\nUser suggested message:')
      parts.push(userMessage)
      parts.push(
        '\nConsider the above message as guidance, but ensure the commit message accurately reflects the changes. Still add commit body if needed.'
      )
    }

    // Add branch context
    const branchName = await GitService.getBranchName()
    parts.push(`\nCurrent branch: ${branchName}`)

    LoggerService.debug(`🔍 Current branch: ${branchName}`)

    // Add recent commits context
    const recentCommits = await GitService.getRecentCommits(5)
    if (recentCommits.length > 0) {
      parts.push('\nRecent commits:')
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
    if (diff.stats.wasSummarized) {
      // For summarized diffs, include the summary and stats
      parts.push(diff.summary)
      parts.push(`\nFiles changed: ${diff.stats.filesChanged}`)
      parts.push(`Additions: ${diff.stats.additions}`)
      parts.push(`Deletions: ${diff.stats.deletions}`)
    } else {
      // For raw diffs, just include the diff directly
      parts.push('\nRaw diff:')
      parts.push(diff.summary)
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
    const prompt = await this.buildPrompt(diff, userMessage)

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
    // Skip logging the full diff since it's already logged in workflow
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
