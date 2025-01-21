import { CommitMessage } from '../types'
import { loggerService } from './Logger.service'
import GitService from './Git.service'

interface UIService {
  handleAction: (
    action: string,
    message: CommitMessage
  ) => Promise<'exit' | 'restart' | void>
}

/**
 * Service for handling user interactions and UI actions.
 */
class UIServiceImpl implements UIService {
  /**
   * Handles the user's action choice.
   *
   * @param action - The chosen action.
   * @param message - The commit message to work with.
   * @returns The result of the action ('exit', 'restart', or void).
   */
  public async handleAction(
    action: string,
    message: CommitMessage
  ): Promise<'exit' | 'restart' | void> {
    switch (action) {
      case 'accept':
        await GitService.commit(message)
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

        await GitService.commit({ title, body })
        loggerService.info('✅ Commit created successfully!')
        return
      }

      case 'regenerate':
        return 'restart'

      case 'diff':
        const diff = await GitService.getStagedChanges()
        console.log('\nFull diff:')
        console.log(diff.summary)
        return this.handleAction(action, message)

      case 'cancel':
        loggerService.info('👋 Operation cancelled')
        return 'exit'

      default:
        loggerService.error(`Unknown action: ${action}`)
        return 'exit'
    }
  }
}

// Export a single instance
export const uiService = new UIServiceImpl()
