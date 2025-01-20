import OpenAI from 'openai'
import { Config, ProcessedDiff, CommitMessage, OpenAIService } from '../types'
import { loggerService } from './logger.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { gitService } from './git.service'

type OpenAIConfig = Config['openai']

const COMMIT_MESSAGE_SYSTEM_CONTENT = `You are a helpful assistant that generates clear and concise git commit messages.
Follow the conventional commits format: <type>(<scope>): <description>
Types: feat|fix|docs|style|refactor|test|chore
Keep the first line under 72 characters.
Use bullet points for the body if needed.
DO NOT INCLUDE ANYTHING ELSE IN THE RESPONSE OR WRAP IN ANYTHING ELSE.
ONLY SEND ONE COMMIT MESSAGE.`

/**
 * Creates an OpenAIService instance.
 *
 * @param config - The OpenAI configuration.
 * @param debugConfig - The debug configuration.
 * @returns An instance of the OpenAIService.
 */
export const createOpenAIService = (
  config: OpenAIConfig,
  debugConfig: Config['debug']
): OpenAIService => {
  const client = new OpenAI({ apiKey: config.apiKey })

  // Configure logger
  loggerService.setConfig(debugConfig)

  /**
   * Builds the prompt for the OpenAI API.
   *
   * @param diff - The diff to generate a commit message for.
   * @param userMessage - Optional user-provided message for guidance.
   * @returns The prompt for the OpenAI API.
   */
  const buildPrompt = async (
    diff: ProcessedDiff,
    userMessage?: string
  ): Promise<string> => {
    const parts = ['Generate a commit message for the following changes:']

    // Add user guidance if provided
    if (userMessage) {
      parts.push('\nUser suggested message:')
      parts.push(userMessage)
      parts.push(
        '\nConsider the above message as guidance, but ensure the commit message accurately reflects the changes.'
      )
    }

    // Add branch context
    const branchName = await gitService.getBranchName()
    parts.push(`\nCurrent branch: ${branchName}`)

    if (debugConfig.enabled) {
      loggerService.debug(`🔍 Current branch: ${branchName}`)
    }

    // Add recent commits context
    const recentCommits = await gitService.getRecentCommits(5)
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

    if (debugConfig.enabled) {
      loggerService.debug('🔍 Recent commits:')
      loggerService.debug(parts.join('\n'))
    }

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
  const parseCommitMessage = (content: string): CommitMessage => {
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
  const generateCommitMessage = async (
    diff: ProcessedDiff,
    userMessage?: string
  ): Promise<CommitMessage> => {
    const prompt = await buildPrompt(diff, userMessage)

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

    if (debugConfig.enabled) {
      loggerService.debug('🔍 API Request:')
      loggerService.debug(`Model: ${config.model}`)
      loggerService.debug(`Max Tokens: ${config.maxTokens}`)
      loggerService.debug(`Temperature: ${config.temperature}`)
      loggerService.debug('Messages:')
      loggerService.debug(`system: ${messages[0].content}`)
      // Skip logging the full diff since it's already logged in workflow
      loggerService.debug('user: <diff content omitted>')

      // loggerService.debug(`user: ${messages[1].content}`)
    }

    const response = await client.chat.completions.create({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      top_p: config.topP,
      frequency_penalty: config.frequencyPenalty,
      presence_penalty: config.presencePenalty,
    })

    loggerService.info(`🔍 Total Tokens: ${response.usage?.total_tokens}`)

    if (debugConfig.enabled) {
      loggerService.debug('🔍 API Response:')
      loggerService.debug(JSON.stringify(response, null, 2))
    }

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No commit message generated')
    }

    return parseCommitMessage(content)
  }

  /**
   * Returns the OpenAIService instance.
   *
   * @returns The OpenAIService instance.
   */
  return {
    generateCommitMessage,
  }
}
