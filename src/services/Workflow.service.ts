import chalk from 'chalk'
import { Config, CommitMessage, ProcessedDiff } from '../types'
import { createOpenAIService } from './OpenAI.service'
import GitService from './Git.service'
import { uiService } from './UI.service'
import LoggerService from './Logger.service'

/**
 * Service for handling the commit message generation workflow.
 */
class WorkflowService {
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
    LoggerService.debug('\n📊 Git Stats:')
    LoggerService.debug(`Files changed: ${diff.stats.filesChanged}`)
    LoggerService.debug(`Additions: ${diff.stats.additions}`)
    LoggerService.debug(`Deletions: ${diff.stats.deletions}`)
    if (diff.stats.wasSummarized) {
      LoggerService.debug('(Diff was summarized due to size)')
      LoggerService.debug(`Original length: ${diff.stats.originalLength}`)
      LoggerService.debug(`Processed length: ${diff.stats.processedLength}`)
    }

    LoggerService.debug('\n📝 Changes:')
    if (diff.details.fileOperations.length > 0) {
      LoggerService.debug('\nFile Operations:')
      diff.details.fileOperations.forEach((op) =>
        LoggerService.debug(`  ${op}`)
      )
    }
    if (diff.details.functionChanges.length > 0) {
      LoggerService.debug('\nFunction Changes:')
      diff.details.functionChanges.forEach((change) =>
        LoggerService.debug(`  ${change}`)
      )
    }
    if (diff.details.dependencyChanges.length > 0) {
      LoggerService.debug('\nDependency Changes:')
      diff.details.dependencyChanges.forEach((dep) =>
        LoggerService.debug(`  ${dep}`)
      )
    }

    LoggerService.debug('\n📄 Raw Diff:')
    LoggerService.debug(diff.details.rawDiff)

    LoggerService.debug('\n📝 Summary:')
    LoggerService.debug(diff.summary)
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
    LoggerService.info('🔍 Analyzing changes...')

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

    LoggerService.info('\n📊 Git Stats:')
    LoggerService.info(`Files changed: ${stagedDiff.stats.filesChanged}`)
    LoggerService.info(`Additions: ${stagedDiff.stats.additions}`)
    LoggerService.info(`Deletions: ${stagedDiff.stats.deletions}`)
    LoggerService.info(`Original length: ${stagedDiff.stats.originalLength}`)
    LoggerService.info(`Processed length: ${stagedDiff.stats.processedLength}`)

    LoggerService.info('💭 Generating commit message...')
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
  new WorkflowService(config)
