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
   * Prompts user to modify context before regenerating.
   *
   * @param currentContext - The current context if any
   * @returns The new context or undefined to keep existing
   */
  private async promptForRegenerationContext(
    currentContext?: string
  ): Promise<string | undefined> {
    const { default: inquirer } = await import('inquirer')

    // First ask if they want to modify context
    const { wantToModify } = await inquirer.prompt([
      {
        type: 'list',
        name: 'wantToModify',
        message: currentContext
          ? 'Would you like to modify the existing context?'
          : 'Would you like to add context to help guide the AI?',
        choices: [
          {
            name: currentContext
              ? 'Yes, modify existing context'
              : 'Yes, add new context',
            value: true,
          },
          {
            name: currentContext
              ? 'No, keep existing context'
              : 'No, regenerate without context',
            value: false,
          },
        ],
      },
    ])

    if (!wantToModify) {
      return undefined
    }

    // Get new/modified context
    const { newContext } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newContext',
        message: 'Enter context to guide the AI:',
        default: currentContext,
        validate: (input: string) => {
          if (input.length > 500) return 'Context must be under 500 characters'
          return true
        },
      },
    ])

    return newContext.trim() || undefined
  }

  /**
   * Handles the user's action choice.
   *
   * @param action - The chosen action.
   * @param message - The commit message to work with.
   * @param currentContext - The current user context if any
   * @returns The result of the action ('exit', 'restart', or void) and optionally new context.
   */
  public async handleAction(
    action: string,
    message: CommitMessage,
    currentContext?: string
  ): Promise<{ result: 'exit' | 'restart' | void; newContext?: string }> {
    switch (action) {
      case 'accept':
        await GitService.commit(message)
        LoggerService.info('✅ Commit created successfully!')
        return { result: undefined }

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
        return { result: undefined }
      }

      case 'regenerate': {
        const newContext = await this.promptForRegenerationContext(
          currentContext
        )
        return {
          result: 'restart',
          newContext: newContext !== undefined ? newContext : currentContext,
        }
      }

      case 'diff':
        const diff = await GitService.getStagedChanges()
        console.log('\nFull diff:')
        console.log(diff.summary)
        return this.handleAction(action, message, currentContext)

      case 'cancel':
        LoggerService.info('👋 Operation cancelled')
        return { result: 'exit' }

      default:
        LoggerService.error(`Unknown action: ${action}`)
        return { result: 'exit' }
    }
  }
}

// Export a single instance
export const uiService = new UIService()
