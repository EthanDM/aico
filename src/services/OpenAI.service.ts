import OpenAI from 'openai'
import { Config, CommitMessage, ProcessedDiff } from '../types'
import LoggerService from './Logger.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { PromptBuilder } from '../prompts/PromptBuilder'
import GitService from './Git.service'
import { CommitHeuristics } from '../heuristics/CommitHeuristics'
import { ScopeInferrer } from '../heuristics/ScopeInferrer'

type OpenAIConfig = Config['openai']

interface OpenAIOptions {
  context?: boolean | string
  noAutoStage?: boolean
  merge?: boolean
}

/**
 * Thin OpenAI API client for making completions and parsing responses.
 * Does not handle orchestration, validation, or retry logic.
 */
export class OpenAIService {
  private client: OpenAI
  private config: OpenAIConfig
  private promptBuilder: PromptBuilder

  constructor(config: Config, options: OpenAIOptions) {
    this.config = config.openai
    this.client = new OpenAI({ apiKey: this.config.apiKey })
    const heuristics = new CommitHeuristics()
    const scopeInferrer = new ScopeInferrer(config.commit.scopeRules)
    this.promptBuilder = new PromptBuilder(
      config,
      heuristics,
      scopeInferrer,
      GitService
    )
  }

  /**
   * Sanitizes the commit message by converting scopes to lowercase kebab-case.
   */
  private sanitizeCommitMessage(message: string): string {
    return message.replace(/^\w+\(([^)]+)\):/, (match, scope) => {
      const kebabScope = scope
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .toLowerCase()
      return match.replace(scope, kebabScope)
    })
  }

  /**
   * Parses the commit message from the OpenAI response.
   */
  public parseCommitMessage(content: string): CommitMessage {
    let cleanContent = content
      .replace(/`/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/^\s*[-*]\s*/gm, '- ')
      .trim()

    cleanContent = this.sanitizeCommitMessage(cleanContent)

    const lines = cleanContent.split('\n')
    const title = lines[0].trim()

    const bodyLines: string[] = []
    let bodyStarted = false

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!bodyStarted && !line) {
        continue
      }
      if (line) {
        bodyStarted = true
        bodyLines.push(line)
      } else if (bodyStarted) {
        bodyLines.push('')
      }
    }

    while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1]) {
      bodyLines.pop()
    }

    return {
      title,
      body: bodyLines.length > 0 ? bodyLines.join('\n') : undefined,
    }
  }

  /**
   * Makes a completion request to OpenAI.
   * Returns the raw response content.
   */
  public async complete(
    messages: ChatCompletionMessageParam[],
    model: string,
    maxCompletionTokens: number,
    temperature?: number
  ): Promise<string> {
    const requestBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      max_completion_tokens: maxCompletionTokens,
    }

    if (!model.startsWith('gpt-5')) {
      requestBody.temperature = temperature ?? this.config.temperature
      requestBody.top_p = this.config.topP
      requestBody.frequency_penalty = this.config.frequencyPenalty
      requestBody.presence_penalty = this.config.presencePenalty
    }

    const response = await this.client.chat.completions.create(requestBody)

    LoggerService.info(`🔍 Total Tokens: ${response.usage?.total_tokens}`)
    LoggerService.debug(`Finish reason: ${response.choices[0]?.finish_reason}`)
    LoggerService.debug(
      '\n📥 Received response from OpenAI:'
    )
    LoggerService.debug(JSON.stringify(response, null, 2))

    return response.choices[0]?.message?.content?.trim() || ''
  }


  /**
   * Generates a branch name based on the provided context.
   */
  public async generateBranchName(
    context: string,
    diff?: ProcessedDiff
  ): Promise<string> {
    const { default: inquirer } = await import('inquirer')

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
- Prefer the provided prefix hint if available.

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
        content: await this.promptBuilder.buildBranchPrompt(context, diff),
      },
    ]

    try {
      const response = await this.complete(
        messages,
        this.config.model,
        60,
        this.config.model.startsWith('gpt-5') ? undefined : 0.3
      )

      const branchName = response
        .split('\n')[0]
        .trim()
        .replace(/[`'"]/g, '')
        .replace(/[^a-z0-9/-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')

      const validPrefixes = [
        'feat/',
        'fix/',
        'refactor/',
        'chore/',
        'style/',
        'docs/',
      ]
      let normalizedBranch = branchName
      const hasValidPrefix = validPrefixes.some((prefix) =>
        normalizedBranch.startsWith(prefix)
      )

      const text = context.toLowerCase()
      const prefixHint = /(fix|bug|crash|broken|regression)/.test(text)
        ? 'fix/'
        : /(refactor|cleanup|rename|restructure)/.test(text)
          ? 'refactor/'
          : /(docs|readme|changelog)/.test(text)
            ? 'docs/'
            : /(style|format|lint|eslint|prettier)/.test(text)
              ? 'style/'
              : 'feat/'

      if (!hasValidPrefix) {
        normalizedBranch = normalizedBranch.replace(/^[^/]+\//, '')
        normalizedBranch = prefixHint + normalizedBranch.replace(/^\/+/, '')
      }

      const maxLength = 40
      if (normalizedBranch.length > maxLength) {
        const prefix = normalizedBranch.split('/')[0] + '/'
        const name = normalizedBranch.slice(prefix.length)
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

      return normalizedBranch
    } catch (error) {
      LoggerService.error('Failed to generate branch name')
      throw error
    }
  }
}

/**
 * Creates and exports a new OpenAI service instance.
 */
export const createOpenAIService = (
  config: Config,
  options: OpenAIOptions
): OpenAIService => {
  return new OpenAIService(config, options)
}

export default OpenAIService
