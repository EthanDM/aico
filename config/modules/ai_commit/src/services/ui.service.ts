import chalk from 'chalk'
import { CommitMessage } from '../types'
import { loggerService } from './logger.service'
import { gitService } from './git.service'

interface UIService {
  handleAction: (
    action: string,
    message: CommitMessage
  ) => Promise<'exit' | 'restart' | void>
}

/**
 * Creates a UI service to handle user interactions.
 *
 * @returns An instance of the UIService.
 */
const createUIService = (): UIService => {
  /**
   * Handles the user's action choice.
   *
   * @param action - The chosen action.
   * @param message - The commit message to work with.
   * @returns The result of the action ('exit', 'restart', or void).
   */
  const handleAction = async (
    action: string,
    message: CommitMessage
  ): Promise<'exit' | 'restart' | void> => {
    switch (action) {
      case 'accept':
        await gitService.commit(message)
        loggerService.info('✅ Commit created successfully!')
        return

      case 'edit': {
        const { default: inquirer } = await import('inquirer')
        const { editedMessage } = await inquirer.prompt([
          {
            type: 'editor',
            name: 'editedMessage',
            message: 'Edit the commit message:',
            default: [message.title, '', message.body]
              .filter(Boolean)
              .join('\n'),
          },
        ])

        const lines = editedMessage.split('\n')
        const title = lines[0]
        const body = lines.slice(2).join('\n')

        await gitService.commit({ title, body })
        loggerService.info('✅ Commit created successfully!')
        return
      }

      case 'regenerate':
        return 'restart'

      case 'diff':
        const diff = await gitService.getStagedChanges()
        console.log('\nFull diff:')
        console.log(diff.summary)
        return handleAction(action, message)

      case 'cancel':
        loggerService.info('👋 Operation cancelled')
        return 'exit'

      default:
        loggerService.error(`Unknown action: ${action}`)
        return 'exit'
    }
  }

  return {
    handleAction,
  }
}

// Export a single instance
export const uiService = createUIService()
