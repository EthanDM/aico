import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { CommitMessage } from '../types'
import { createLogger } from '../utils/logger'
import { gitService } from './git.service'

interface UIService {
  editMessage: (message: string) => Promise<string>
  viewDiff: () => Promise<void>
  handleAction: (
    action: string,
    message: CommitMessage,
    logger: ReturnType<typeof createLogger>
  ) => Promise<'exit' | 'restart' | void>
}

/**
 * Creates a UIService instance to handle user interactions.
 *
 * @returns An instance of the UIService.
 */
export const createUIService = (): UIService => {
  /**
   * Opens an editor to edit the commit message.
   *
   * @param message - The message to edit.
   * @returns The edited message.
   */
  const editMessage = async (message: string): Promise<string> => {
    const editor = process.env.EDITOR || 'vim'
    const tempFile = '/tmp/commit-message.txt'

    await fs.writeFile(tempFile, message)

    return new Promise((resolve, reject) => {
      const child = spawn(editor, [tempFile], { stdio: 'inherit' })
      child.on('exit', async () => {
        try {
          const editedMessage = await fs.readFile(tempFile, 'utf8')
          await fs.unlink(tempFile)
          resolve(editedMessage.trim())
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  /**
   * Shows the full diff in a pager.
   */
  const viewDiff = async (): Promise<void> => {
    const pager = process.env.GIT_PAGER || process.env.PAGER || 'less'

    return new Promise((resolve) => {
      const diff = spawn('git', ['diff', '--staged'], {
        stdio: ['inherit', 'pipe', 'inherit'],
      })
      const less = spawn(pager, [], { stdio: ['pipe', 'inherit', 'inherit'] })

      diff.stdout.pipe(less.stdin)
      less.on('exit', resolve)
    })
  }

  /**
   * Handles user actions like accepting, editing, or regenerating commit messages.
   *
   * @param action - The action to perform.
   * @param message - The commit message to work with.
   * @param logger - The logger instance.
   * @returns 'exit' to exit the program, 'restart' to restart the flow, or void to continue
   */
  const handleAction = async (
    action: string,
    message: CommitMessage,
    logger: ReturnType<typeof createLogger>
  ): Promise<'exit' | 'restart' | void> => {
    switch (action) {
      case 'accept':
        logger.info('✨ Committing changes...')
        await gitService.commit(message)
        logger.info('✅ Changes committed successfully!')
        return 'exit'

      case 'edit':
        logger.info('✏️  Opening editor...')
        const editedMessage = await editMessage(
          [message.title, '', message.body].filter(Boolean).join('\n')
        )

        if (editedMessage) {
          logger.info('✨ Committing changes...')
          await gitService.commit(editedMessage)
          logger.info('✅ Changes committed successfully!')
          return 'exit'
        } else {
          logger.error('❌ Commit cancelled - empty message')
          return 'exit'
        }

      case 'regenerate':
        logger.info('🔄 Regenerating message...')
        return 'restart'

      case 'diff':
        logger.info('📄 Showing full diff...')
        await viewDiff()
        return 'restart'

      case 'cancel':
        logger.info('❌ Commit cancelled')
        return 'exit'

      default:
        logger.error(`❌ Unknown action: ${action}`)
        return 'exit'
    }
  }

  return {
    editMessage,
    viewDiff,
    handleAction,
  }
}

export const uiService = createUIService()
