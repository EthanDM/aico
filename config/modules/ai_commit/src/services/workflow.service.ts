import chalk from 'chalk'
import { Config, CommitMessage } from '../types'
import { createOpenAIService } from './openai.service'
import { gitService } from './git.service'
import { uiService } from './ui.service'
import { createLogger } from '../utils/logger'

interface WorkflowService {
  generateCommitMessage: () => Promise<CommitMessage>
  displayResults: (
    diff: Awaited<ReturnType<typeof gitService.getStagedChanges>>,
    message: CommitMessage
  ) => void
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

    logger.info('💭 Generating commit message...')
    const message = await openai.generateCommitMessage(diff)

    displayResults(diff, message)
    return message
  }

  /**
   * Displays the changes and proposed commit message.
   *
   * @param diff - The git diff information.
   * @param message - The generated commit message.
   */
  const displayResults = (
    diff: Awaited<ReturnType<typeof gitService.getStagedChanges>>,
    message: CommitMessage
  ): void => {
    console.log('\n📝 Changes to be committed:')
    if (diff.stats.wasSummarized) {
      console.log(chalk.blue('(Summarized due to size)'))
    }
    console.log(chalk.blue(diff.summary))

    console.log('\n💡 Proposed commit message:')
    console.log(chalk.green(message.title))
    if (message.body) {
      console.log('\n' + message.body)
    }
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
    displayResults,
    promptForAction,
  }
}

export const createWorkflow = (
  config: Config,
  logger: ReturnType<typeof createLogger>
): WorkflowService => createWorkflowService(config, logger)
