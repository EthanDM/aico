import OpenAI from 'openai'
import { Config, ProcessedDiff, CommitMessage } from '../types'
import LoggerService from './Logger.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import GitService from './Git.service'
import { COMMIT_MESSAGE_SYSTEM_CONTENT } from '../constants/openai.constants'
import { CommitValidator } from '../validation/CommitValidator'
import { CommitHeuristics } from '../heuristics/CommitHeuristics'
import { ScopeInferrer } from '../heuristics/ScopeInferrer'
import { SubjectRepairer } from '../validation/SubjectRepairer'
import { PromptBuilder } from '../prompts/PromptBuilder'

type OpenAIConfig = Config['openai']
type CommitConfig = Config['commit']

const SUBJECT_PARSE_PATTERN =
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: (.+)$/

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
  private validator: CommitValidator
  private heuristics: CommitHeuristics
  private scopeInferrer: ScopeInferrer
  private repairer: SubjectRepairer
  private promptBuilder: PromptBuilder

  constructor(config: Config, options: OpenAIOptions) {
    this.config = config.openai
    this.commitConfig = config.commit
    this.client = new OpenAI({ apiKey: this.config.apiKey })
    this.options = options
    this.validator = new CommitValidator(this.commitConfig)
    this.heuristics = new CommitHeuristics()
    this.scopeInferrer = new ScopeInferrer(this.commitConfig.scopeRules)
    this.repairer = new SubjectRepairer(
      this.commitConfig,
      this.heuristics,
      this.scopeInferrer,
      this.validator
    )
    this.promptBuilder = new PromptBuilder(
      config,
      this.heuristics,
      this.scopeInferrer,
      GitService
    )
  }

  /**
   * Detects if this is a merge commit and extracts conflict information.
   *
   * @param diff - The processed diff
   * @param userMessage - Optional user-provided message for guidance
   * @param isMerge - Whether this is explicitly a merge commit
   * @returns Information about the merge and conflicts, if any
   */
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

    const prompt = await this.promptBuilder.buildCommitPrompt(
      diff,
      userMessage,
      includeBodyAllowed,
      this.commitConfig.includeBody,
      this.options.merge
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
    const internalChange = this.heuristics.isInternalToolingChange(diff)
    const docsOnly = this.heuristics.isDocsOnlyChange(diff)

    let lastMessage: CommitMessage | undefined
    let lastErrors: string[] = []

    const attemptOnce = async (
      isRetry: boolean
    ): Promise<{ message?: CommitMessage; errors?: string[] }> => {
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
        return { errors: ['Empty response from model'] }
      }

      if (isRetry && finishReason !== 'stop') {
        return { errors: ['Retry did not finish successfully'] }
      }

      const parsedMessage = this.parseCommitMessage(rawContent)
      lastMessage = parsedMessage

      const validation = this.validator.validate(parsedMessage, {
        maxTitleLength: this.commitConfig.maxTitleLength,
        includeBodyMode: this.commitConfig.includeBody,
        includeBodyAllowed,
        internalChange,
        docsOnly,
      })

      if (validation.valid) {
        return { message: parsedMessage }
      }

      const subjectOnly: CommitMessage = {
        title: parsedMessage.title,
        body: undefined,
      }
      const subjectOnlyValidation = this.validator.validate(subjectOnly, {
        maxTitleLength: this.commitConfig.maxTitleLength,
        includeBodyMode: this.commitConfig.includeBody,
        includeBodyAllowed,
        internalChange,
        docsOnly,
      })
      if (subjectOnlyValidation.valid) {
        return { message: subjectOnly }
      }

      const docsRepaired = this.repairer.repairDocs(diff, parsedMessage.title)
      if (docsRepaired) {
        LoggerService.debug(
          `Repaired subject locally: "${parsedMessage.title}" -> "${docsRepaired}"`
        )
        return { message: { title: docsRepaired, body: undefined } }
      }

      const repaired = this.repairer.repair(diff, parsedMessage.title)
      if (repaired) {
        LoggerService.debug(
          `Repaired subject locally: "${parsedMessage.title}" -> "${repaired}"`
        )
        return { message: { title: repaired, body: undefined } }
      }

      return { errors: validation.errors }
    }

    const firstAttempt = await attemptOnce(false)
    if (firstAttempt.message) {
      return firstAttempt.message
    }

    lastErrors = firstAttempt.errors || []
    const { structural } = this.validator.splitValidationErrors(lastErrors)
    const structuralFailure =
      structural.length > 0 ||
      lastErrors.some(
        (error) =>
          error.includes('Empty response') ||
          error.includes('Retry did not finish')
      )
    if (!structuralFailure) {
      return {
        title: this.repairer.buildFallback(diff, lastMessage?.title),
        body: undefined,
      }
    }

    const secondAttempt = await attemptOnce(true)
    if (secondAttempt.message) {
      return secondAttempt.message
    }

    return {
      title: this.repairer.buildFallback(diff, lastMessage?.title),
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
      let normalizedBranch = branchName
      const hasValidPrefix = validPrefixes.some((prefix) =>
        normalizedBranch.startsWith(prefix)
      )

      // Infer the prefix hint the same way promptBuilder does
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

      // Enforce maximum length by truncating if necessary
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

  /**
   * Builds the prompt for branch name generation.
   *
   * @param context - User provided context
   * @param diff - Optional diff to consider
   * @returns The prompt for the OpenAI API
   */
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
