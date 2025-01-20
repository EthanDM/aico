import { simpleGit, SimpleGit } from 'simple-git'
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

interface GitService {
  getStagedChanges(): Promise<ProcessedDiff>
  getAllChanges(): Promise<ProcessedDiff>
  getStatus(): Promise<GitStatus>
  getShortStatus(): Promise<string>
  getBranchName(): Promise<string>
  getRecentCommits(count?: number): Promise<GitCommit[]>
  commit(message: CommitMessage | string): Promise<void>
  hasChanges(): Promise<boolean>
  hasStaged(): Promise<boolean>
  stageAll(): Promise<void>
}

/**
 * Creates a GitService instance.
 *
 * @returns An instance of the GitService.
 */
const createGitService = (): GitService => {
  const git: SimpleGit = simpleGit()

  /**
   * Gets the current branch name.
   *
   * @returns The current branch name.
   */
  const getBranchName = async (): Promise<string> => {
    return git.revparse(['--abbrev-ref', 'HEAD'])
  }

  /**
   * Gets recent commits.
   *
   * @param count - Number of commits to retrieve (default: 5).
   * @returns Array of recent commits with their details.
   */
  const getRecentCommits = async (count: number = 5): Promise<GitCommit[]> => {
    const log = await git.log([
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
  const getStatus = async (): Promise<GitStatus> => {
    const status = await git.status()
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
  const getStagedDiff = async (): Promise<string> => {
    return git.diff(['--staged'])
  }

  /**
   * Gets the diff of all changes in the git repository.
   *
   * @returns The diff of all changes in the git repository.
   */
  const getAllDiff = async (): Promise<string> => {
    return git.diff()
  }

  /**
   * Formats the commit message.
   *
   * @param message - The commit message to format.
   * @returns The formatted commit message.
   */
  const formatCommitMessage = (message: CommitMessage | string): string => {
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
   * Commits the changes to the git repository.
   *
   * @param message - The commit message to commit.
   * @returns A promise that resolves when the commit is successful.
   */
  const commit = async (message: CommitMessage | string): Promise<void> => {
    const formattedMessage = formatCommitMessage(message)
    await git.commit(formattedMessage)
  }

  /**
   * Checks if there are any changes in the git repository.
   *
   * @returns Whether there are any changes in the git repository.
   */
  const hasChanges = async (): Promise<boolean> => {
    const status = await getStatus()
    return !status.isClean
  }

  /**
   * Checks if there are any staged changes in the git repository.
   *
   * @returns Whether there are any staged changes in the git repository.
   */
  const hasStaged = async (): Promise<boolean> => {
    const status = await getStatus()
    return status.staged.length > 0
  }

  /**
   * Processes the diff of the git repository.
   *
   * @param rawDiff - The raw diff of the git repository.
   * @param changedFiles - The changed files of the git repository.
   * @returns The processed diff of the git repository.
   */
  const processDiff = async (
    rawDiff: string,
    changedFiles: string[]
  ): Promise<ProcessedDiff> => {
    // Import the processDiff function from diffProcessor
    const { processDiff: processGitDiff } = await import('../git/diffProcessor')
    return processGitDiff(rawDiff, changedFiles)
  }

  /**
   * Gets the staged changes of the git repository.
   *
   * @returns The staged changes of the git repository.
   */
  const getStagedChanges = async (): Promise<ProcessedDiff> => {
    const status = await getStatus()
    const diff = await getStagedDiff()
    return processDiff(diff, status.staged)
  }

  /**
   * Gets the all changes of the git repository.
   *
   * @returns The all changes of the git repository.
   */
  const getAllChanges = async (): Promise<ProcessedDiff> => {
    const status = await getStatus()
    const diff = await getAllDiff()
    return processDiff(diff, status.modified)
  }

  /**
   * Stages all changes in the working directory.
   */
  const stageAll = async (): Promise<void> => {
    await git.add('.')
  }

  /**
   * Gets a short status display of changes.
   *
   * @returns The short status display.
   */
  const getShortStatus = async (): Promise<string> => {
    return git.raw(['status', '--short'])
  }

  /**
   * Returns the GitService instance.
   *
   * @returns The GitService instance.
   */
  return {
    getStagedChanges,
    getAllChanges,
    getStatus,
    getShortStatus,
    commit,
    hasChanges,
    hasStaged,
    stageAll,
    getBranchName,
    getRecentCommits,
  }
}

// Export a single instance
export const gitService = createGitService()
