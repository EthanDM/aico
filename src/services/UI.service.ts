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
   * Lets user edit the commit title inline.
   *
   * @param currentTitle - The current commit title
   * @returns The edited title
   */
  private async editTitle(currentTitle: string): Promise<string> {
    const { default: inquirer } = await import('inquirer')
    const { newTitle } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newTitle',
        message: 'Edit commit title:',
        default: currentTitle,
        validate: (input: string) => {
          if (input.trim().length === 0) return 'Title cannot be empty'
          if (input.length > 72) return 'Title must be under 72 characters'
          return true
        },
      },
    ])
    return newTitle.trim()
  }

  /**
   * Lets user edit individual bullet points inline.
   *
   * @param body - The current commit body
   * @returns The edited body
   */
  private async editBullets(body: string): Promise<string> {
    const bullets = body
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.trim())

    const { default: inquirer } = await import('inquirer')
    const editedBullets: string[] = []

    for (const bullet of bullets) {
      const { editedBullet } = await inquirer.prompt([
        {
          type: 'input',
          name: 'editedBullet',
          message: 'Edit bullet point (empty to remove):',
          default: bullet,
          validate: (input: string) => {
            if (input.length > 100)
              return 'Bullet point must be under 100 characters'
            return true
          },
        },
      ])
      if (editedBullet.trim()) {
        editedBullets.push(editedBullet.trim())
      }
    }

    // Option to add new bullets
    while (true) {
      const { newBullet } = await inquirer.prompt([
        {
          type: 'input',
          name: 'newBullet',
          message: 'Add new bullet point (empty to finish):',
          validate: (input: string) => {
            if (input.length > 100)
              return 'Bullet point must be under 100 characters'
            return true
          },
        },
      ])
      if (!newBullet.trim()) break
      editedBullets.push(newBullet.trim())
    }

    return editedBullets.join('\n')
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
              { name: 'Edit title only', value: 'title' },
              {
                name: 'Edit bullet points individually',
                value: 'bullets-edit',
              },
              {
                name: 'Select which bullet points to keep',
                value: 'bullets-select',
              },
              { name: 'Edit everything in text editor', value: 'full' },
            ],
          },
        ])

        let newTitle = message.title
        let newBody = message.body

        switch (editType) {
          case 'title':
            newTitle = await this.editTitle(message.title)
            break

          case 'bullets-edit':
            if (message.body) {
              newBody = await this.editBullets(message.body)
            }
            break

          case 'bullets-select':
            if (message.body) {
              newBody = await this.selectBulletPoints(message.body)
            }
            break

          case 'full':
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
            newTitle = lines[0]
            newBody = lines.slice(2).join('\n')
            break
        }

        await GitService.commit({
          title: newTitle,
          body: newBody,
        })
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
