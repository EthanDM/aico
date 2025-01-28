import { SimpleGit, simpleGit } from 'simple-git'
import DiffProcessor from '../processors/Diff.processor'
import { ProcessedDiff, CommitMessage } from '../types'
import LoggerService from './Logger.service'

interface GitCommit {
  hash: string
  date: string
  message: string
  refs?: string
}

interface GitStatus {
  isClean: boolean
  staged: string[]
  modified: string[]
}

/**
 * Service for interacting with Git repository and managing version control operations.
 */
class GitService {
  private git: SimpleGit

  constructor() {
    this.git = simpleGit()
  }

  /**
   * Gets the current branch name.
   *
   * @returns The current branch name.
   */
  public async getBranchName(): Promise<string> {
    return this.git.revparse(['--abbrev-ref', 'HEAD'])
  }

  /**
   * Gets recent commits.
   *
   * @param count - Number of commits to retrieve (default: 5).
   * @returns Array of recent commits with their details.
   */
  public async getRecentCommits(count: number = 5): Promise<GitCommit[]> {
    const log = await this.git.log([
      `-${count}`,
      '--pretty=format:%h|%ar|%B|%d',
      '--date=relative',
    ])

    return log.all.map((entry) => {
      const parts = entry.hash.split('|')
      if (parts.length < 3) {
        return {
          hash: parts[0] || '',
          date: parts[1] || '',
          message: '',
          refs: undefined,
        }
      }

      const [hash, date, ...rest] = parts
      const message = rest.slice(0, -1).join('|').trim()
      const refs = rest[rest.length - 1]

      const cleanMessage = message
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line)
        .join('\n')

      return {
        hash: hash.trim(),
        date: date.trim(),
        message: cleanMessage,
        refs: refs && refs !== ' ' ? refs.trim() : undefined,
      }
    })
  }

  /**
   * Gets the status of the git repository.
   *
   * @returns The status of the git repository.
   */
  public async getStatus(): Promise<GitStatus> {
    const status = await this.git.status()
    return {
      isClean: status.isClean(),
      staged: status.staged,
      modified: status.modified,
    }
  }

  /**
   * Gets the staged diff of the git repository.
   *
   * @returns The staged diff of the git repository.
   */
  public async getStagedDiff(): Promise<string> {
    return this.git.diff(['--staged'])
  }

  /**
   * Gets the diff of all changes in the git repository.
   *
   * @returns The diff of all changes in the git repository.
   */
  public async getAllDiff(): Promise<string> {
    return this.git.diff()
  }

  /**
   * Formats the commit message.
   *
   * @param message - The commit message to format.
   * @returns The formatted commit message.
   */
  private formatCommitMessage(message: CommitMessage | string): string {
    if (typeof message === 'string') {
      return message
    }

    return [
      message.title,
      '\n', // Empty line after title
      message.body,
    ]
      .filter(Boolean)
      .join('\n')
  }

  /**
   * Gets the staged changes with processed diff information.
   *
   * @returns The processed diff of staged changes.
   */
  public async getStagedChanges(): Promise<ProcessedDiff> {
    const diff = await this.getStagedDiff()
    return DiffProcessor.processDiff(diff)
  }

  /**
   * Gets all changes with processed diff information.
   *
   * @returns The processed diff of all changes.
   */
  public async getAllChanges(): Promise<ProcessedDiff> {
    const diff = await this.getAllDiff()
    return DiffProcessor.processDiff(diff)
  }

  /**
   * Gets a short status display of changes.
   *
   * @returns The short status display.
   */
  public async getShortStatus(): Promise<string> {
    return this.git.raw(['status', '--short'])
  }

  /**
   * Checks if there are any changes in the working directory.
   *
   * @returns True if there are changes, false otherwise.
   */
  public async hasChanges(): Promise<boolean> {
    const status = await this.getStatus()
    return !status.isClean
  }

  /**
   * Checks if there are any staged changes.
   *
   * @returns True if there are staged changes, false otherwise.
   */
  public async hasStaged(): Promise<boolean> {
    const status = await this.getStatus()
    return status.staged.length > 0
  }

  /**
   * Stages changes for commit.
   * If skip is true, automatically stages all changes without prompting.
   */
  public async stageChanges(skip: boolean = false): Promise<void> {
    const hasChanges =
      (await this.git.status()).modified.length > 0 ||
      (await this.git.status()).not_added.length > 0

    if (!hasChanges) {
      throw new Error('No changes to commit')
    }

    if (skip) {
      // Stage all changes automatically
      await this.git.add('.')
      LoggerService.info('✨ Automatically staged all changes')
      return
    }

    // Show interactive staging prompt
    const { default: inquirer } = await import('inquirer')
    const { shouldStage } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldStage',
        message: 'Would you like to stage all changes?',
        default: true,
      },
    ])

    if (shouldStage) {
      await this.git.add('.')
      LoggerService.info('✨ Staged all changes')
    } else {
      throw new Error('Operation cancelled: No changes staged')
    }
  }

  /**
   * Creates a commit with the given message.
   */
  public async commit(message: CommitMessage): Promise<void> {
    await this.git.commit(this.formatCommitMessage(message))
    LoggerService.info('✨ Created commit successfully')
  }
}

export default new GitService()
