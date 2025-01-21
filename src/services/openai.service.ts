import OpenAI from 'openai'
import { Config, ProcessedDiff, CommitMessage, OpenAIService } from '../types'
import { loggerService } from './logger.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import GitService from './git.service'

type OpenAIConfig = Config['openai']

const COMMIT_MESSAGE_SYSTEM_CONTENT = `You are an AI specializing in creating precise and professional git commit messages.
Strictly follow the **Conventional Commits** format: <type>(<scope>): <description>

- **Type**: One of feat, fix, docs, style, refactor, test, chore, perf, build, ci, or revert.
- **Scope**: Optional but recommended. Indicates the part of the codebase being changed (e.g., "api", "ui", "auth").
- **Description**: A concise, imperative summary of the changes (e.g., "Add feature").

**Examples**:
- feat(api): add user authentication flow
- fix(ui): resolve alignment issues in modal
- chore(deps): update dependencies

**Rules**:
1. **Summary (Title)**:
   - Strictly under 72 characters.
   - Rephrase or truncate if necessary while retaining clarity.

2. **Body**:
   - Use 2-6 bullet points with concise, meaningful changes.
   - Each point starts with a verb (e.g., "Add", "Fix", "Update").
   - Avoid redundant or filler points.
   - Each bullet point must not exceed 100 characters.

3. **Validation and Output**:
   - Ensure strict adherence to Conventional Commits.
   - Respond with a single plain text commit message (no extra formatting, code blocks, or symbols).
   - Use "\n" for line breaks between the title and body.
   - Only generate one commit message per response.`

/**
 * Service for interacting with OpenAI to generate commit messages.
 */
class OpenAIServiceImpl implements OpenAIService {
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

    loggerService.debug(`🔍 Current branch: ${branchName}`)

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

    loggerService.debug('🔍 Recent commits:')
    loggerService.debug(parts.join('\n'))

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

    loggerService.debug('\n🔍 Building OpenAI Request:')
    loggerService.debug(`Model: ${this.config.model}`)
    loggerService.debug(`Max Tokens: ${this.config.maxTokens}`)
    loggerService.debug(`Temperature: ${this.config.temperature}`)
    loggerService.debug('Messages:')
    loggerService.debug(`system: ${messages[0].content}`)
    // Skip logging the full diff since it's already logged in workflow
    loggerService.debug('user: <diff content omitted>')

    loggerService.debug('\n📤 Sending request to OpenAI...')

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      frequency_penalty: this.config.frequencyPenalty,
      presence_penalty: this.config.presencePenalty,
    })

    loggerService.info(`🔍 Total Tokens: ${response.usage?.total_tokens}`)

    loggerService.debug('\n📥 Received response from OpenAI:')
    loggerService.debug(JSON.stringify(response, null, 2))

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
  return new OpenAIServiceImpl(config)
}
