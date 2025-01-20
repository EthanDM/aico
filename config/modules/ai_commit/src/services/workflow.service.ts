import chalk from 'chalk'
import { Config, CommitMessage, ProcessedDiff } from '../types'
import { createOpenAIService } from './openai.service'
import { gitService } from './git.service'
import { uiService } from './ui.service'
import { createLogger } from '../utils/logger'

interface WorkflowService {
  generateCommitMessage: () => Promise<CommitMessage>
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
   * Generates a commit message based on staged changes.
   *
   * @returns The generated commit message.
   * @throws Error if there are no changes to commit.
   */
  const generateCommitMessage = async (): Promise<CommitMessage> => {
    logger.info('🔍 Analyzing changes...')
    const diff = await gitService.getStagedChanges()

    if (diff.stats.filesChanged === 0) {
      throw new Error('No changes to commit')
    }

    // Log detailed diff information in debug mode
    logDebugDiff(diff)

    logger.info('💭 Generating commit message...')
    const message = await openai.generateCommitMessage(diff)

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
