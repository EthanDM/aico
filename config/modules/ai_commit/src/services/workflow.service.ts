import chalk from 'chalk'
import { Config, CommitMessage, ProcessedDiff } from '../types'
import { createOpenAIService } from './openai.service'
import { gitService } from './git.service'
import { uiService } from './ui.service'
import { createLogger } from '../utils/logger'

interface WorkflowService {
  generateCommitMessage: (userMessage?: string) => Promise<CommitMessage>
  promptForAction: (
    message: CommitMessage
  ) => Promise<'exit' | 'restart' | void>
}

/**
 * Creates a workflow service to handle the commit message generation flow.
 *
 * @param config - The program configuration.
 * @param logger - The logger instance.
 * @returns An instance of the WorkflowService.
 */
export const createWorkflowService = (
  config: Config,
  logger: ReturnType<typeof createLogger>
): WorkflowService => {
  const openai = createOpenAIService(config.openai, config.debug)

  /**
   * Logs debug information about the diff.
   *
   * @param diff - The processed diff information.
   */
  const logDebugDiff = (diff: ProcessedDiff): void => {
    if (!config.debug.enabled) return

    logger.debug('\n📊 Git Stats:')
    logger.debug(`Files changed: ${diff.stats.filesChanged}`)
    logger.debug(`Additions: ${diff.stats.additions}`)
    logger.debug(`Deletions: ${diff.stats.deletions}`)
    if (diff.stats.wasSummarized) {
      logger.debug('(Diff was summarized due to size)')
      logger.debug(`Original length: ${diff.stats.originalLength}`)
      logger.debug(`Processed length: ${diff.stats.processedLength}`)
    }

    logger.debug('\n📝 Changes:')
    if (diff.details.fileOperations.length > 0) {
      logger.debug('\nFile Operations:')
      diff.details.fileOperations.forEach((op) => logger.debug(`  ${op}`))
    }
    if (diff.details.functionChanges.length > 0) {
      logger.debug('\nFunction Changes:')
      diff.details.functionChanges.forEach((change) =>
        logger.debug(`  ${change}`)
      )
    }
    if (diff.details.dependencyChanges.length > 0) {
      logger.debug('\nDependency Changes:')
      diff.details.dependencyChanges.forEach((dep) => logger.debug(`  ${dep}`))
    }

    logger.debug('\n📄 Summary:')
    logger.debug(diff.summary)
  }

  /**
   * Prompts the user about staging changes.
   *
   * @returns True if we should proceed (either changes were staged or user wants to continue anyway).
   */
  const handleUnstagedChanges = async (
    stagedCount: number,
    totalCount: number
  ): Promise<boolean> => {
    logger.warn('⚠️  Some changes are not staged for commit')
    logger.info('   Staged: ' + chalk.green(`${stagedCount} files`))
    logger.info('   Total:  ' + chalk.yellow(`${totalCount} files`))

    // Show status before prompting
    const status = await gitService.getShortStatus()
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
        await gitService.stageAll()
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
  const generateCommitMessage = async (
    userMessage?: string
  ): Promise<CommitMessage> => {
    logger.info('🔍 Analyzing changes...')

    if (userMessage && config.debug.enabled) {
      logger.debug(`🔍 User provided message: ${userMessage}`)
    }

    // Check both staged and all changes
    const [hasStaged, hasChanges] = await Promise.all([
      gitService.hasStaged(),
      gitService.hasChanges(),
    ])

    // Handle different staging states
    if (!hasChanges) {
      throw new Error('No changes detected in the working directory')
    }

    if (!hasStaged) {
      logger.warn('No changes are currently staged for commit')

      // Show status before prompting
      const status = await gitService.getShortStatus()
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
        await gitService.stageAll()
      } else {
        process.exit(0)
      }
    }

    // Get diffs after potential staging
    let stagedDiff = await gitService.getStagedChanges()
    const allDiff = await gitService.getAllChanges()

    // Check if there are still unstaged changes
    if (stagedDiff.stats.filesChanged < allDiff.stats.filesChanged) {
      const shouldProceed = await handleUnstagedChanges(
        stagedDiff.stats.filesChanged,
        allDiff.stats.filesChanged
      )

      if (!shouldProceed) {
        process.exit(0)
      }

      // Refresh diff if we staged more changes
      if (stagedDiff.stats.filesChanged !== allDiff.stats.filesChanged) {
        stagedDiff = await gitService.getStagedChanges()
      }
    }

    // Log detailed diff information in debug mode
    logDebugDiff(stagedDiff)

    logger.info('\n📊 Git Stats:')
    logger.info(`Files changed: ${stagedDiff.stats.filesChanged}`)
    logger.info(`Additions: ${stagedDiff.stats.additions}`)
    logger.info(`Deletions: ${stagedDiff.stats.deletions}`)
    logger.info(`Original length: ${stagedDiff.stats.originalLength}`)
    logger.info(`Processed length: ${stagedDiff.stats.processedLength}`)

    logger.info('💭 Generating commit message...')
    const message = await openai.generateCommitMessage(stagedDiff, userMessage)

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
  const promptForAction = async (
    message: CommitMessage
  ): Promise<'exit' | 'restart' | void> => {
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

    return uiService.handleAction(action, message, logger)
  }

  return {
    generateCommitMessage,
    promptForAction,
  }
}

export const createWorkflow = (
  config: Config,
  logger: ReturnType<typeof createLogger>
): WorkflowService => createWorkflowService(config, logger)
