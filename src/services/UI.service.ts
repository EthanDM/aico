import { CommitMessage } from '../types'
import LoggerService from './Logger.service'
import GitService from './Git.service'

/**
 * Service for handling user interactions and UI actions.
 */
class UIService {
  /**
   * Lets user select which bullet points to keep in the commit message body.
   *
   * @param body - The commit message body
   * @returns The filtered body with only selected bullet points
   */
  private async selectBulletPoints(body: string): Promise<string> {
    const bullets = body
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.trim())

    const { default: inquirer } = await import('inquirer')
    const { selectedBullets } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedBullets',
        message:
          'Select bullet points to keep (space to toggle, enter to confirm):',
        choices: bullets.map((bullet) => ({
          name: bullet,
          checked: true, // All bullets start checked
        })),
        pageSize: 10,
      },
    ])

    return selectedBullets.join('\n')
  }

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
        LoggerService.info('✅ Commit created successfully!')
        return

      case 'edit': {
        const { default: inquirer } = await import('inquirer')

        // First ask what type of edit they want to do
        const { editType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'editType',
            message: 'How would you like to edit the commit message?',
            choices: [
              { name: 'Edit everything in text editor', value: 'full' },
              { name: 'Select which bullet points to keep', value: 'bullets' },
            ],
          },
        ])

        if (editType === 'bullets' && message.body) {
          const newBody = await this.selectBulletPoints(message.body)
          await GitService.commit({
            title: message.title,
            body: newBody,
          })
          LoggerService.info('✅ Commit created successfully!')
          return
        }

        // Full edit in text editor
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
        LoggerService.info('✅ Commit created successfully!')
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
        LoggerService.info('👋 Operation cancelled')
        return 'exit'

      default:
        LoggerService.error(`Unknown action: ${action}`)
        return 'exit'
    }
  }
}

// Export a single instance
export const uiService = new UIService()
