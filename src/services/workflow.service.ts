import chalk from 'chalk'
import { Config, CommitMessage, ProcessedDiff } from '../types'
import { createOpenAIService } from './openai.service'
import GitService from './git.service'
import { uiService } from './ui.service'
import { loggerService } from './logger.service'

interface WorkflowService {
  generateCommitMessage: (userMessage?: string) => Promise<CommitMessage>
  promptForAction: (
    message: CommitMessage
  ) => Promise<'exit' | 'restart' | void>
}

/**
 * Service for handling the commit message generation workflow.
 */
class WorkflowServiceImpl implements WorkflowService {
  private openai

  constructor(config: Config) {
    this.openai = createOpenAIService(config.openai)
  }

  /**
   * Logs debug information about the diff.
   *
   * @param diff - The processed diff information.
   */
  private logDebugDiff(diff: ProcessedDiff): void {
    loggerService.debug('\n📊 Git Stats:')
    loggerService.debug(`Files changed: ${diff.stats.filesChanged}`)
    loggerService.debug(`Additions: ${diff.stats.additions}`)
    loggerService.debug(`Deletions: ${diff.stats.deletions}`)
    if (diff.stats.wasSummarized) {
      loggerService.debug('(Diff was summarized due to size)')
      loggerService.debug(`Original length: ${diff.stats.originalLength}`)
      loggerService.debug(`Processed length: ${diff.stats.processedLength}`)
    }

    loggerService.debug('\n📝 Changes:')
    if (diff.details.fileOperations.length > 0) {
      loggerService.debug('\nFile Operations:')
      diff.details.fileOperations.forEach((op) =>
        loggerService.debug(`  ${op}`)
      )
    }
    if (diff.details.functionChanges.length > 0) {
      loggerService.debug('\nFunction Changes:')
      diff.details.functionChanges.forEach((change) =>
        loggerService.debug(`  ${change}`)
      )
    }
    if (diff.details.dependencyChanges.length > 0) {
      loggerService.debug('\nDependency Changes:')
      diff.details.dependencyChanges.forEach((dep) =>
        loggerService.debug(`  ${dep}`)
      )
    }

    loggerService.debug('\n📄 Raw Diff:')
    loggerService.debug(diff.details.rawDiff)

    loggerService.debug('\n📝 Summary:')
    loggerService.debug(diff.summary)
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
    loggerService.warn('⚠️  Some changes are not staged for commit')
    loggerService.info('   Staged: ' + chalk.green(`${stagedCount} files`))
    loggerService.info('   Total:  ' + chalk.yellow(`${totalCount} files`))

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
        await GitService.stageAll()
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
    loggerService.info('🔍 Analyzing changes...')

    if (userMessage) {
      loggerService.debug(`\n💬 User provided message: ${userMessage}`)
    }

    // Check both staged and all changes
    const [hasStaged, hasChanges] = await Promise.all([
      GitService.hasStaged(),
      GitService.hasChanges(),
    ])

    loggerService.debug('\n📋 Git Status:')
    loggerService.debug(`Has staged changes: ${hasStaged}`)
    loggerService.debug(`Has working changes: ${hasChanges}`)

    // Handle different staging states
    if (!hasChanges) {
      throw new Error('No changes detected in the working directory')
    }

    if (!hasStaged) {
      loggerService.warn('No changes are currently staged for commit')

      // Show status before prompting
      const status = await GitService.getShortStatus()
      console.log('\nWorking directory status:')
      console.log(chalk.blue(status))

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
        await GitService.stageAll()
      } else {
        process.exit(0)
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

    // Log detailed diff information in debug mode
    this.logDebugDiff(stagedDiff)

    loggerService.info('\n📊 Git Stats:')
    loggerService.info(`Files changed: ${stagedDiff.stats.filesChanged}`)
    loggerService.info(`Additions: ${stagedDiff.stats.additions}`)
    loggerService.info(`Deletions: ${stagedDiff.stats.deletions}`)
    loggerService.info(`Original length: ${stagedDiff.stats.originalLength}`)
    loggerService.info(`Processed length: ${stagedDiff.stats.processedLength}`)

    loggerService.info('💭 Generating commit message...')
    const message = await this.openai.generateCommitMessage(
      stagedDiff,
      userMessage
    )

    console.log('\n💡 Proposed commit message:')
    console.log(chalk.green(message.title))
    if (message.body) {
      console.log('\n' + message.body)
    }

    return message
  }

  /**
   * Prompts the user for action and handles their choice.
   *
   * @param message - The commit message to work with.
   * @returns The result of the action ('exit', 'restart', or void).
   */
  public async promptForAction(
    message: CommitMessage
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

    return uiService.handleAction(action, message)
  }
}

/**
 * Creates and exports a workflow service instance.
 *
 * @param config - The program configuration
 * @returns A workflow service instance
 */
export const createWorkflow = (config: Config): WorkflowService =>
  new WorkflowServiceImpl(config)
