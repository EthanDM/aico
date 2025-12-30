import {
  Config,
  ProcessedDiff,
  CommitMessage,
  PullRequestMessage,
  PullRequestTemplate,
} from '../types'
import OpenAIService from './OpenAI.service'
import { PromptBuilder } from '../prompts/PromptBuilder'
import { CommitValidator } from '../validation/CommitValidator'
import { SubjectRepairer } from '../validation/SubjectRepairer'
import { CommitHeuristics } from '../heuristics/CommitHeuristics'
import { ScopeInferrer } from '../heuristics/ScopeInferrer'
import { PullRequestHeuristics } from '../heuristics/PullRequestHeuristics'
import GitService from './Git.service'
import LoggerService from './Logger.service'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { COMMIT_MESSAGE_SYSTEM_CONTENT } from '../constants/openai.constants'
import { PullRequestValidator } from '../validation/PullRequestValidator'

/**
 * Service for orchestrating the commit message generation pipeline.
 * Handles AI generation, validation, repair, and fallback strategies.
 * Coordinates between OpenAI, validation, and heuristic services.
 */

type OpenAIConfig = Config['openai']
type CommitConfig = Config['commit']

interface GeneratorOptions {
  context?: boolean | string
  noAutoStage?: boolean
  merge?: boolean
}

/**
 * Service for orchestrating commit message generation.
 * Handles prompt building, validation, repair, and retry logic.
 */
export class CommitGeneratorService {
  private openai: OpenAIService
  private promptBuilder: PromptBuilder
  private validator: CommitValidator
  private repairer: SubjectRepairer
  private heuristics: CommitHeuristics
  private scopeInferrer: ScopeInferrer
  private prHeuristics: PullRequestHeuristics
  private prValidator: PullRequestValidator
  private config: OpenAIConfig
  private commitConfig: CommitConfig
  private options: GeneratorOptions

  constructor(config: Config, options: GeneratorOptions = {}) {
    this.config = config.openai
    this.commitConfig = config.commit
    this.options = options
    this.openai = new OpenAIService(config, options)
    this.heuristics = new CommitHeuristics()
    this.scopeInferrer = new ScopeInferrer(this.commitConfig.scopeRules)
    this.prHeuristics = new PullRequestHeuristics(
      this.heuristics,
      this.scopeInferrer
    )
    this.prValidator = new PullRequestValidator()
    this.validator = new CommitValidator(this.commitConfig)
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
   * Determines if a body should be included in the commit message.
   */
  private shouldIncludeBody(
    mode: CommitConfig['includeBody'],
    stats: ProcessedDiff['stats'],
    userMessage?: string
  ): boolean {
    if (mode === 'always') return true
    if (mode === 'never') return false
    const linesChanged = stats.additions + stats.deletions
    const hasUserContext = Boolean(userMessage && userMessage.trim())
    return stats.filesChanged >= 4 || linesChanged >= 150 || hasUserContext
  }

  /**
   * Generates a commit message for the given diff.
   */
  public async generateCommitMessage(
    diff: ProcessedDiff,
    userMessage?: string
  ): Promise<CommitMessage> {
    // Check for very large diffs
    const LARGE_DIFF_THRESHOLD = 30000
    if (
      diff.summary.length > LARGE_DIFF_THRESHOLD &&
      !this.config.model.includes('mini') &&
      !this.options.context
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
      this.options.merge || false
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

      const rawContent = await this.openai.complete(
        messages,
        model,
        maxCompletionTokens,
        temperature
      )

      if (!rawContent) {
        return { errors: ['Empty response from model'] }
      }

      if (isRetry && !rawContent.includes('stop')) {
        return { errors: ['Retry did not finish successfully'] }
      }

      const parsedMessage = this.openai.parseCommitMessage(rawContent)
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
   */
  public async generateBranchName(
    context: string,
    diff?: ProcessedDiff
  ): Promise<string> {
    return this.openai.generateBranchName(context, diff)
  }

  /**
   * Generates a pull request title and description for the given diff.
   */
  public async generatePullRequestMessage(
    diff: ProcessedDiff,
    userMessage?: string,
    baseBranch?: string,
    commitSubjects: string[] = []
  ): Promise<PullRequestMessage> {
    const branchName = await GitService.getBranchName()
    const prHints = this.prHeuristics.infer(
      diff,
      branchName,
      commitSubjects,
      userMessage
    )

    const buildPrompt = async (templateOverride?: PullRequestTemplate) => {
      return this.promptBuilder.buildPullRequestPrompt(
        userMessage,
        diff,
        baseBranch,
        {
          type: prHints.type,
          scope: prHints.scope,
          template: templateOverride || prHints.template,
          platform: prHints.platformHints,
          riskLevel: prHints.riskLevel,
          groupings: prHints.groupings,
          testTouched: prHints.testTouched,
          uiTouched: prHints.uiTouched,
          commitSubjects,
        }
      )
    }

    const prompt = await buildPrompt()

    const attemptOnce = async (
      template: PullRequestTemplate,
      promptOverride?: string,
      previousMessage?: PullRequestMessage,
      violations?: string[]
    ): Promise<PullRequestMessage> => {
      const basePrompt = promptOverride || prompt
      if (previousMessage && violations && violations.length > 0) {
        const repairPrompt = `${basePrompt}\n\nPrevious output:\n${previousMessage.title}\n\n${previousMessage.body}\n\nViolations:\n- ${violations.join(
          '\n- '
        )}\n\nReturn a corrected title and description that follow the template exactly.`
        return this.openai.generatePullRequestMessage(repairPrompt)
      }

      return this.openai.generatePullRequestMessage(basePrompt)
    }

    const first = await attemptOnce(prHints.template)
    const validation = this.prValidator.validate(first, prHints.template)
    if (validation.valid) {
      return first
    }

    LoggerService.debug(
      `PR message failed validation: ${validation.errors.join('; ')}`
    )

    const wantsDefaultTemplate = validation.errors.some((error) =>
      error.includes('Group heading') || error.includes('Grouped template')
    )
    if (wantsDefaultTemplate && prHints.template === 'grouped') {
      const defaultPrompt = await buildPrompt('default')
      const fallback = await attemptOnce('default', defaultPrompt)
      const fallbackValidation = this.prValidator.validate(fallback, 'default')
      if (fallbackValidation.valid) {
        return fallback
      }
    }

    const repaired = await attemptOnce(
      prHints.template,
      undefined,
      first,
      validation.errors
    )
    const secondValidation = this.prValidator.validate(
      repaired,
      prHints.template
    )
    if (secondValidation.valid) {
      return repaired
    }

    return first
  }
}

/**
 * Creates and exports a new CommitGenerator service instance.
 */
export const createCommitGenerator = (
  config: Config,
  options: GeneratorOptions = {}
): CommitGeneratorService => {
  return new CommitGeneratorService(config, options)
}

export default CommitGeneratorService
