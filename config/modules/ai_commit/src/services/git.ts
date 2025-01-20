import { simpleGit, SimpleGit } from 'simple-git'
import { ProcessedDiff, CommitMessage } from '../types'

interface GitStatus {
  isClean: boolean
  staged: string[]
  modified: string[]
}

interface GitService {
  getStagedChanges(): Promise<ProcessedDiff>
  getAllChanges(): Promise<ProcessedDiff>
  getStatus(): Promise<GitStatus>
  commit(message: CommitMessage | string): Promise<void>
  hasChanges(): Promise<boolean>
  hasStaged(): Promise<boolean>
}

const TOKEN_LIMIT = 20000

const createGitService = (): GitService => {
  const git: SimpleGit = simpleGit()

  const getStatus = async (): Promise<GitStatus> => {
    const status = await git.status()
    return {
      isClean: status.isClean(),
      staged: status.staged,
      modified: status.modified,
    }
  }

  const getStagedDiff = async (): Promise<string> => {
    return git.diff(['--staged'])
  }

  const getAllDiff = async (): Promise<string> => {
    return git.diff()
  }

  const formatCommitMessage = (message: CommitMessage | string): string => {
    if (typeof message === 'string') {
      return message
    }

    return [
      message.title,
      '', // Empty line after title
      message.body,
    ]
      .filter(Boolean)
      .join('\n')
  }

  const commit = async (message: CommitMessage | string): Promise<void> => {
    const formattedMessage = formatCommitMessage(message)
    await git.commit(formattedMessage)
  }

  const hasChanges = async (): Promise<boolean> => {
    const status = await getStatus()
    return !status.isClean
  }

  const hasStaged = async (): Promise<boolean> => {
    const status = await getStatus()
    return status.staged.length > 0
  }

  const processDiff = async (
    rawDiff: string,
    changedFiles: string[]
  ): Promise<ProcessedDiff> => {
    // Import the processDiff function from diffProcessor
    const { processDiff: processGitDiff } = await import('../git/diffProcessor')
    return processGitDiff(rawDiff, changedFiles)
  }

  const getStagedChanges = async (): Promise<ProcessedDiff> => {
    const status = await getStatus()
    const diff = await getStagedDiff()
    return processDiff(diff, status.staged)
  }

  const getAllChanges = async (): Promise<ProcessedDiff> => {
    const status = await getStatus()
    const diff = await getAllDiff()
    return processDiff(diff, status.modified)
  }

  return {
    getStagedChanges,
    getAllChanges,
    getStatus,
    commit,
    hasChanges,
    hasStaged,
  }
}

// Export a single instance
export const gitService = createGitService()
