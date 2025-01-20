import OpenAI from 'openai'
import { Config, ProcessedDiff, CommitMessage } from '../types'
import { createLogger } from '../utils/logger'

type OpenAIConfig = Config['openai']

interface OpenAIService {
  generateCommitMessage: (diff: ProcessedDiff) => Promise<CommitMessage>
}

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
  const logger = createLogger(debugConfig)

  /**
   * Builds the prompt for the OpenAI API.
   *
   * @param diff - The diff to generate a commit message for.
   * @returns The prompt for the OpenAI API.
   */
  const buildPrompt = (diff: ProcessedDiff): string => {
    const parts = ['Generate a commit message for the following changes:']

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
   * @returns The commit message.
   */
  const generateCommitMessage = async (
    diff: ProcessedDiff
  ): Promise<CommitMessage> => {
    const prompt = buildPrompt(diff)
    const messages = [
      {
        role: 'system' as const,
        content: `You are a helpful assistant that generates clear and concise git commit messages.
          Follow the conventional commits format: <type>(<scope>): <description>
          Types: feat|fix|docs|style|refactor|test|chore
          Keep the first line under 72 characters.
          Use bullet points for the body if needed.
          DO NOT INCLUDE ANYTHING ELSE IN THE RESPONSE OR WRAP IN ANYTHING ELSE.`,
      },
      {
        role: 'user' as const,
        content: prompt,
      },
    ]

    if (debugConfig.enabled) {
      logger.debug('🔍 API Request:')
      logger.debug(`Model: ${config.model}`)
      logger.debug(`Max Tokens: ${config.maxTokens}`)
      logger.debug(`Temperature: ${config.temperature}`)
      logger.debug('Messages:')
      messages.forEach((msg) => {
        logger.debug(`${msg.role}: ${msg.content}`)
      })
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

    if (debugConfig.enabled) {
      logger.debug('🔍 API Response:')
      logger.debug(JSON.stringify(response, null, 2))
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
