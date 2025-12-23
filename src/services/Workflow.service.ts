import chalk from 'chalk'
import { Config, CommitMessage, ProcessedDiff } from '../types'
import { createOpenAIService } from './OpenAI.service'
import GitService from './Git.service'
import { uiService } from './UI.service'
import LoggerService from './Logger.service'
import AppLogService from './AppLog.service'

interface WorkflowOptions {
  context?: boolean | string
  noAutoStage?: boolean
  merge?: boolean
  branch?: boolean
}

/**
 * Service for handling the commit message generation workflow.
 */
class WorkflowService {
  private openai
  private options: WorkflowOptions
  private config: Config
  private providedContext?: string

  constructor(config: Config, options: WorkflowOptions = {}) {
    this.config = config
    this.options = {
      context: options.context || false,
      noAutoStage: options.noAutoStage || false,
      merge: options.merge || false,
      branch: options.branch || false,
    }

    // Extract context string if provided
    if (typeof options.context === 'string') {
      this.providedContext = options.context
      this.options.context = true // Enable context mode
    }

    this.openai = createOpenAIService(config, this.options)
  }

  /**
   * Prompts the user for optional context/guidance.
   *
   * @param required - Whether context input is required
   * @returns The user provided context, or undefined if none provided
   */
  private async promptForContext(
    required: boolean = false
  ): Promise<string | undefined> {
    // If context was provided via command line, use it
    if (this.providedContext) {
      return this.providedContext
    }

    // Only prompt for context if the context flag is set or it's required
    if (!this.options.context && !required) {
      return undefined
    }

    const { default: inquirer } = await import('inquirer')
    const { context } = await inquirer.prompt([
      {
        type: 'input',
        name: 'context',
        message: 'Add context to help guide the AI:',
        validate: (input: string) => {
          if (required && !input.trim()) {
            return 'Context is required for branch name generation'
          }
          return true
        },
      },
    ])

    return context ? context.trim() : undefined
  }

  /**
   * Generates a commit message for the current changes.
   *
   * @returns The generated commit message
   */
  public async generateCommitMessage(): Promise<CommitMessage> {
    // First check if there are any changes at all (staged or unstaged)
    const { stagedCount, totalCount } = await GitService.getChangeCount()

    if (totalCount === 0) {
      throw new Error('No changes detected')
    }

    // Handle staging before proceeding
    if (stagedCount < totalCount) {
      const shouldProceed = await this.handleUnstagedChanges(
        stagedCount,
        totalCount
      )
      if (!shouldProceed) {
        throw new Error('Operation cancelled')
      }
    }

    const isMerge =
      this.options.merge || (await GitService.isMergingBranch())
    if (isMerge) {
      return GitService.buildMergeCommitMessage()
    }

    // Get the staged changes after staging is handled
    const diff = await GitService.getStagedChanges(
      this.options.merge,
      this.config.openai.model
    )
    AppLogService.gitStats(diff)

    // Get user context if enabled
    const context = await this.promptForContext()

    // Generate the commit message
    AppLogService.generatingCommitMessage()
    const message = await this.openai.generateCommitMessage(diff, context)
    AppLogService.commitMessageGenerated(message)

    return message
  }

  /**
   * Prompts the user about staging changes.
   *
   * @returns True if we should proceed (either changes were staged or user wants to continue anyway).
   */
  private async handleUnstagedChanges(
    stagedCount: number,
    totalCount: number
  ): Promise<boolean> {
    // If auto-staging is enabled (default), stage all changes automatically
    if (!this.options.noAutoStage) {
      try {
        await GitService.stageChanges(true)
        return true
      } catch (error) {
        // If staging fails, show the error but don't throw
        LoggerService.error('Failed to auto-stage changes: ' + error)
      }
    }

    // If we get here, either auto-staging is disabled or it failed
    LoggerService.warn('⚠️  Some changes are not staged for commit')
    LoggerService.info('   Staged: ' + chalk.green(`${stagedCount} files`))
    LoggerService.info('   Total:  ' + chalk.yellow(`${totalCount} files`))

    // Show status before prompting
    const status = await GitService.getShortStatus()
    console.log('\nWorking directory status:')
    console.log(chalk.blue(status))

    const { default: inquirer } = await import('inquirer')
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Would you like to stage the remaining changes?',
        choices: [
          { name: 'Stage all changes', value: 'stage' },
          { name: 'Continue with staged changes only', value: 'continue' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ])

    switch (action) {
      case 'stage':
        await GitService.stageChanges(true)
        return true
      case 'continue':
        return true
      case 'cancel':
        process.exit(0)
      default:
        return false
    }
  }

  /**
   * Generates a branch name based on user context and optionally the current changes.
   *
   * @param currentContext - Optional existing context to use
   * @returns The generated branch name
   */
  public async generateBranchName(currentContext?: string): Promise<string> {
    let context = currentContext || this.providedContext

    while (true) {
      // Get context for branch name - use provided context, passed context, or prompt for it
      if (!context) {
        context = await this.promptForContext(true)
      }

      if (!context) {
        throw new Error('Context is required for branch name generation')
      }

      let diff: ProcessedDiff | undefined

      try {
        // If there are staged changes, include them in the context
        const { stagedCount } = await GitService.getChangeCount()
        if (stagedCount > 0) {
          diff = await GitService.getStagedChanges(
            false,
            this.config.openai.model
          )
          AppLogService.gitStats(diff)
        }
      } catch (error) {
        // Ignore Git errors - we don't require changes for branch names
        LoggerService.debug(
          'No Git repository or changes detected, proceeding with context only'
        )
      }

      LoggerService.info('\n🌿 Generating branch name...')
      const branchName = await this.openai.generateBranchName(context, diff)

      console.log('\n🎯 Generated branch name:')
      console.log(chalk.green(branchName))

      // Handle user actions for the branch name
      const action = await uiService.promptForBranchAction()
      const { result, newContext } = await uiService.handleBranchAction(
        action,
        branchName
      )

      if (result === 'restart') {
        context = newContext
        continue
      }

      if (result === 'exit') {
        throw new Error('Branch name generation cancelled')
      }

      return branchName
    }
  }

  /**
   * Prompts the user for action on the generated commit message.
   *
   * @param message - The generated commit message
   * @param currentContext - The current user context if any
   * @returns The result of the action ('exit', 'restart', or void)
   */
  public async promptForAction(
    message: CommitMessage,
    currentContext?: string
  ): Promise<'exit' | 'restart' | void> {
    const action = await uiService.promptForAction(message)
    const { result, newContext } = await uiService.handleAction(
      action,
      message,
      currentContext
    )

    if (result === 'restart') {
      // Generate a new message with potentially updated context
      const newMessage = await this.generateCommitMessage()
      return this.promptForAction(newMessage, newContext)
    }

    if (result === 'repeat') {
      return this.promptForAction(message, currentContext)
    }

    return result
  }
}

/**
 * Creates and exports a workflow service instance.
 *
 * @param config - The program configuration
 * @param options - The workflow options
 * @returns A workflow service instance
 */
export const createWorkflow = (
  config: Config,
  options: WorkflowOptions = {}
): WorkflowService => new WorkflowService(config, options)
