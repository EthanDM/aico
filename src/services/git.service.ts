import { simpleGit, SimpleGit } from 'simple-git'
import DiffProcessor from '../processors/diffProcessor'
import { ProcessedDiff, CommitMessage } from '../types'

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
      '--pretty=format:%h|%ar|%s|%d',
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
      const message = rest.slice(0, -1).join('|') // Join all parts except the last one
      const refs = rest[rest.length - 1]

      return {
        hash: hash.trim(),
        date: date.trim(),
        message: message.trim(),
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
  private async getStagedDiff(): Promise<string> {
    return this.git.diff(['--staged'])
  }

  /**
   * Gets the diff of all changes in the git repository.
   *
   * @returns The diff of all changes in the git repository.
   */
  private async getAllDiff(): Promise<string> {
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
   * Stages all changes in the working directory.
   */
  public async stageAll(): Promise<void> {
    await this.git.add('.')
  }

  /**
   * Commits the staged changes.
   *
   * @param message - The commit message.
   */
  public async commit(message: CommitMessage | string): Promise<void> {
    await this.git.commit(this.formatCommitMessage(message))
  }
}

export default new GitService()
