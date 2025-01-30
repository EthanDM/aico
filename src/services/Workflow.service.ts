import chalk from 'chalk'
import { Config, CommitMessage, ProcessedDiff } from '../types'
import { createOpenAIService } from './OpenAI.service'
import GitService from './Git.service'
import { uiService } from './UI.service'
import LoggerService from './Logger.service'
import AppLogService from './AppLog.service'

interface WorkflowOptions {
  context?: boolean
  noAutoStage?: boolean
}

/**
 * Service for handling the commit message generation workflow.
 */
class WorkflowService {
  private openai
  private options: WorkflowOptions

  constructor(config: Config, options: WorkflowOptions = {}) {
    this.options = options
    this.openai = createOpenAIService(config.openai, {
      context: options.context || false,
      noAutoStage: options.noAutoStage || false,
    })
  }

  /**
   * Prompts the user for optional context/guidance for the commit message.
   *
   * @returns The user provided context, or undefined if none provided.
   */
  private async promptForContext(): Promise<string | undefined> {
    // Only prompt for context if the context flag is set
    if (!this.options.context) {
      return undefined
    }

    const { default: inquirer } = await import('inquirer')
    const { context } = await inquirer.prompt([
      {
        type: 'input',
        name: 'context',
        message: 'Add any context to help guide the AI:',
      },
    ])

    return context ? context.trim() : undefined
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
      await GitService.stageChanges(true)
      return true
    }

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
   * Generates a commit message based on staged changes.
   *
   * @param userMessage - Optional user-provided message for guidance.
   * @returns The generated commit message.
   * @throws Error if there are no changes to commit.
   */
  public async generateCommitMessage(
    userMessage?: string
  ): Promise<CommitMessage> {
    LoggerService.info('🔍 Analyzing changes...')

    // If no message was provided via CLI, prompt for context if enabled
    if (!userMessage) {
      userMessage = await this.promptForContext()
    }

    if (userMessage) {
      LoggerService.debug(`\n💬 User provided message: ${userMessage}`)
    }

    // Check both staged and all changes
    const [hasStaged, hasChanges] = await Promise.all([
      GitService.hasStaged(),
      GitService.hasChanges(),
    ])

    LoggerService.debug('\n📋 Git Status:')
    LoggerService.debug(`Has staged changes: ${hasStaged}`)
    LoggerService.debug(`Has working changes: ${hasChanges}`)

    // Handle different staging states
    if (!hasChanges) {
      throw new Error('No changes detected in the working directory')
    }

    if (!hasStaged) {
      LoggerService.warn('No changes are currently staged for commit')

      // Show status before staging
      const status = await GitService.getShortStatus()
      console.log('\nWorking directory status:')
      console.log(chalk.blue(status))

      // If auto-staging is enabled (default), stage all changes automatically
      if (!this.options.noAutoStage) {
        await GitService.stageChanges(true)
      } else {
        const { default: inquirer } = await import('inquirer')
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'Would you like to stage all changes?',
            choices: [
              { name: 'Stage all changes', value: 'stage' },
              { name: 'Cancel', value: 'cancel' },
            ],
          },
        ])

        if (action === 'stage') {
          await GitService.stageChanges(true)
        } else {
          process.exit(0)
        }
      }
    }

    // Get diffs after potential staging
    let stagedDiff = await GitService.getStagedChanges()
    const allDiff = await GitService.getAllChanges()

    // Check if there are still unstaged changes
    if (stagedDiff.stats.filesChanged < allDiff.stats.filesChanged) {
      const shouldProceed = await this.handleUnstagedChanges(
        stagedDiff.stats.filesChanged,
        allDiff.stats.filesChanged
      )

      if (!shouldProceed) {
        process.exit(0)
      }

      // Refresh diff if we staged more changes
      if (stagedDiff.stats.filesChanged !== allDiff.stats.filesChanged) {
        stagedDiff = await GitService.getStagedChanges()
      }
    }

    AppLogService.debugGitDiff(stagedDiff)
    AppLogService.gitStats(stagedDiff)

    AppLogService.generatingCommitMessage()

    const message = await this.openai.generateCommitMessage(
      stagedDiff,
      userMessage
    )

    AppLogService.commitMessageGenerated(message)

    return message
  }

  /**
   * Prompts the user for action and handles their choice.
   * If skip flag is set, automatically accepts and commits.
   *
   * @param message - The commit message to work with.
   * @param currentContext - The current user context if any
   * @returns The result of the action ('exit', 'restart', or void).
   */
  public async promptForAction(
    message: CommitMessage,
    currentContext?: string
  ): Promise<'exit' | 'restart' | void> {
    const { default: inquirer } = await import('inquirer')
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Accept and commit', value: 'accept' },
          { name: 'Edit message', value: 'edit' },
          { name: 'Regenerate message', value: 'regenerate' },
          { name: 'View full diff', value: 'diff' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ])

    const { result, newContext } = await uiService.handleAction(
      action,
      message,
      currentContext
    )

    if (result === 'restart') {
      // Generate a new message with potentially updated context
      const newMessage = await this.generateCommitMessage(newContext)
      return this.promptForAction(newMessage, newContext)
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
