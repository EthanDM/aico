import { SimpleGit, simpleGit } from 'simple-git'
import DiffProcessor from '../processors/Diff.processor'
import { ProcessedDiff, CommitMessage } from '../types'
import LoggerService from './Logger.service'

export interface GitCommit {
  hash: string
  date: string
  message: string
  refs?: string
}

export interface GitStatus {
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
   * Checks if the repository has any commits.
   *
   * @returns True if the repository has at least one commit, false otherwise.
   */
  private async hasCommits(): Promise<boolean> {
    try {
      await this.git.revparse(['HEAD'])
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Gets the current branch name.
   *
   * @returns The current branch name or 'main' for new repositories.
   */
  public async getBranchName(): Promise<string> {
    try {
      return await this.git.revparse(['--abbrev-ref', 'HEAD'])
    } catch (error) {
      // For new repositories without commits, default to 'main'
      return 'main'
    }
  }

  /**
   * Gets recent commits.
   *
   * @param count - Number of commits to retrieve (default: 5).
   * @returns Array of recent commits with their details.
   */
  public async getRecentCommits(count: number = 5): Promise<GitCommit[]> {
    if (!(await this.hasCommits())) {
      return []
    }

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
      staged: [
        ...status.staged,
        ...status.created,
        ...status.deleted.filter((file) => status.staged.includes(file)),
      ],
      modified: [
        ...status.modified,
        ...status.not_added,
        ...status.deleted.filter((file) => !status.staged.includes(file)),
      ],
    }
  }

  /**
   * Gets the staged diff of the git repository.
   *
   * @returns The staged diff of the git repository.
   */
  public async getStagedDiff(): Promise<string> {
    if (!(await this.hasCommits())) {
      // For new repositories, get the diff of staged changes against an empty tree
      const status = await this.git.status()
      if (status.staged.length === 0) {
        return ''
      }
      // Use --cached to show staged changes and include binary files
      return this.git.raw(['diff', '--cached', '--full-index'])
    }
    return this.git.diff(['--staged', '--full-index'])
  }

  /**
   * Gets the diff of all changes in the git repository.
   *
   * @returns The diff of all changes in the git repository.
   */
  public async getAllDiff(): Promise<string> {
    if (!(await this.hasCommits())) {
      // For new repositories, compare against the empty tree object and include binary files
      const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904' // git hash-object -t tree /dev/null
      return this.git.raw(['diff', '--full-index', emptyTree])
    }
    return this.git.diff(['--full-index'])
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
   * @param isMerge - Whether this is a merge commit
   * @returns The processed diff of staged changes.
   */
  public async getStagedChanges(
    isMerge: boolean = false
  ): Promise<ProcessedDiff> {
    const diff = await this.getStagedDiff()
    return DiffProcessor.processDiff(diff, isMerge)
  }

  /**
   * Gets all changes with processed diff information.
   *
   * @param isMerge - Whether this is a merge commit
   * @returns The processed diff of all changes.
   */
  public async getAllChanges(isMerge: boolean = false): Promise<ProcessedDiff> {
    const diff = await this.getAllDiff()
    return DiffProcessor.processDiff(diff, isMerge)
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
    try {
      const status = await this.git.status()
      const hasChanges =
        status.modified.length > 0 ||
        status.not_added.length > 0 ||
        status.created.length > 0 ||
        status.deleted.length > 0

      if (!hasChanges) {
        throw new Error('No changes to commit')
      }

      if (skip) {
        // Stage all changes automatically, including untracked files and deletions
        await this.git.add(['.'])
        // Explicitly stage deletions
        if (status.deleted.length > 0) {
          await this.git.raw(['add', '-u'])
        }
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
        await this.git.add(['.'])
        // Explicitly stage deletions
        if (status.deleted.length > 0) {
          await this.git.raw(['add', '-u'])
        }
        LoggerService.info('✨ Staged all changes')
      } else {
        throw new Error('Operation cancelled: No changes staged')
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Failed to stage changes')
    }
  }

  /**
   * Creates a commit with the given message.
   */
  public async commit(message: CommitMessage): Promise<void> {
    await this.git.commit(this.formatCommitMessage(message))
    LoggerService.info('✨ Created commit successfully')
  }

  /**
   * Checks if we're currently in the middle of a merge operation.
   *
   * @returns True if we're in the middle of a merge, false otherwise.
   */
  public async isMergingBranch(): Promise<boolean> {
    try {
      // Check for MERGE_HEAD file existence
      await this.git.raw(['rev-parse', '--verify', 'MERGE_HEAD'])
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Checks if the current commit has multiple parents (indicating a merge).
   *
   * @returns True if the current commit has multiple parents, false otherwise.
   */
  public async hasMultipleParents(): Promise<boolean> {
    try {
      const parents = await this.git.raw(['log', '-1', '--pretty=%P'])
      return parents.trim().split(' ').length > 1
    } catch (error) {
      return false
    }
  }

  /**
   * Resolves a git reference (like HEAD) to its actual branch name.
   *
   * @param ref - The reference to resolve
   * @returns The resolved branch name
   */
  public async resolveBranchName(ref: string): Promise<string> {
    try {
      if (ref === 'HEAD') {
        // Try to get the symbolic ref first (for current branch)
        try {
          const symbolicRef = await this.git.raw(['symbolic-ref', '--short', 'HEAD'])
          return symbolicRef.trim()
        } catch {
          // If symbolic ref fails, try rev-parse to get the commit hash
          const hash = await this.git.raw(['rev-parse', 'HEAD'])
          // Then try to get the branch name that contains this commit
          const branchName = await this.git.raw([
            'name-rev',
            '--name-only',
            '--exclude=tags/*',
            hash.trim(),
          ])
          return branchName.trim().replace('remotes/origin/', '')
        }
      }
      return ref
    } catch (error) {
      LoggerService.debug(`Could not resolve branch name for ${ref}: ${error}`)
      return ref
    }
  }

  /**
   * Gets the source and target branches of a merge operation.
   *
   * @returns Object containing source and target branch names, if available.
   */
  public async getMergeHeads(): Promise<{ source?: string; target?: string }> {
    try {
      // Get current (target) branch
      const target = await this.getBranchName()

      // Get source branch from MERGE_HEAD
      const source = await this.git.raw(['rev-parse', '--verify', 'MERGE_HEAD'])
      if (!source) {
        return { target }
      }

      // Try to get the branch name for the source commit
      const sourceBranch = await this.git.raw([
        'name-rev',
        '--name-only',
        '--exclude=tags/*',
        source.trim(),
      ])

      // Resolve both branches to their actual names
      const resolvedSource = await this.resolveBranchName(sourceBranch.trim())
      const resolvedTarget = await this.resolveBranchName(target.trim())

      return {
        source: resolvedSource.replace('remotes/origin/', ''),
        target: resolvedTarget,
      }
    } catch (error) {
      LoggerService.debug(`Could not determine merge heads: ${error}`)
      return {}
    }
  }

  /**
   * Gets the count of staged and total changes.
   *
   * @returns Object containing counts of staged and total changes
   */
  public async getChangeCount(): Promise<{
    stagedCount: number
    totalCount: number
  }> {
    const status = await this.getStatus()
    return {
      stagedCount: status.staged.length,
      totalCount: status.staged.length + status.modified.length,
    }
  }

  /**
   * Creates a new branch and switches to it.
   *
   * @param branchName - The name of the branch to create
   */
  public async createAndCheckoutBranch(branchName: string): Promise<void> {
    try {
      await this.git.checkoutLocalBranch(branchName)
      LoggerService.debug(`Created and switched to branch: ${branchName}`)
    } catch (error) {
      LoggerService.error(`Failed to create branch: ${error}`)
      throw error
    }
  }

  /**
   * Checks if a file exists in the git repository.
   *
   * @param path - The path to check, relative to the repository root
   * @returns True if the file exists, false otherwise
   */
  public async fileExists(path: string): Promise<boolean> {
    try {
      await this.git.raw(['cat-file', '-e', `HEAD:${path}`])
      return true
    } catch (error) {
      return false
    }
  }
}

export default new GitService()