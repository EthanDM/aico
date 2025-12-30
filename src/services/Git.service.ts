import { SimpleGit, simpleGit } from 'simple-git'
import DiffProcessor from '../processors/Diff.processor'
import {
  ProcessedDiff,
  CommitMessage,
  NameStatusEntry,
  NameStatusCode,
  NumStatEntry,
} from '../types'
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

    const log = await this.git.log([`-${count}`])

    return log.all.map((entry) => {
      return {
        hash: entry.hash.substring(0, 7), // Short hash like git log --oneline
        date: entry.date,
        message: entry.message,
        refs: entry.refs || undefined,
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
      // Use --cached to show staged changes
      return this.git.raw(['diff', '--cached'])
    }
    return this.git.diff(['--staged'])
  }

  private async refExists(ref: string): Promise<boolean> {
    try {
      await this.git.raw(['show-ref', '--verify', '--quiet', ref])
      return true
    } catch (error) {
      return false
    }
  }

  private stripRefPrefix(ref: string): string {
    return ref
      .replace(/^refs\/remotes\//, '')
      .replace(/^refs\/heads\//, '')
  }

  private async getDefaultRemoteBranch(): Promise<string | undefined> {
    try {
      const ref = await this.git.raw([
        'symbolic-ref',
        '--quiet',
        'refs/remotes/origin/HEAD',
      ])
      const trimmed = ref.trim()
      return trimmed ? this.stripRefPrefix(trimmed) : undefined
    } catch (error) {
      return undefined
    }
  }

  /**
   * Resolves a base branch reference for pull request diffs.
   */
  public async getDefaultBaseBranch(): Promise<string> {
    const remoteHead = await this.getDefaultRemoteBranch()
    if (remoteHead) {
      return remoteHead
    }

    const candidates = [
      'refs/heads/main',
      'refs/heads/master',
      'refs/heads/develop',
      'refs/remotes/origin/main',
      'refs/remotes/origin/master',
      'refs/remotes/origin/develop',
    ]

    for (const ref of candidates) {
      if (await this.refExists(ref)) {
        return this.stripRefPrefix(ref)
      }
    }

    return 'main'
  }

  /**
   * Gets the diff of the current branch against a base ref.
   */
  public async getBranchDiff(baseRef: string): Promise<string> {
    return this.git.raw(['diff', `${baseRef}...HEAD`])
  }

  /**
   * Gets commit subjects between base and head (excluding merges).
   */
  public async getCommitSubjectsBetween(
    baseRef: string,
    headRef: string = 'HEAD'
  ): Promise<string[]> {
    try {
      const output = await this.git.raw([
        'log',
        '--no-merges',
        '--pretty=%s',
        `${baseRef}..${headRef}`,
      ])
      return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    } catch (error) {
      return []
    }
  }

  public async getBranchNameStatusRaw(
    baseRef: string
  ): Promise<NameStatusEntry[]> {
    const output = await this.git.raw([
      'diff',
      '--name-status',
      `${baseRef}...HEAD`,
    ])
    const lines = output.split('\n').map((line) => line.trim()).filter(Boolean)

    const entries: NameStatusEntry[] = []

    for (const line of lines) {
      const parts = line.split('\t').filter(Boolean)
      if (parts.length === 0) continue

      const statusRaw = parts[0]
      const status = statusRaw[0] as NameStatusCode

      if ((status === 'R' || status === 'C') && parts.length >= 3) {
        entries.push({
          status,
          oldPath: parts[1],
          path: parts[2],
        })
        continue
      }

      if (parts.length >= 2) {
        entries.push({
          status,
          path: parts[1],
        })
        continue
      }

      const fallback = line.split(/\s+/)
      if (fallback.length >= 2) {
        entries.push({
          status,
          path: fallback[1],
        })
      }
    }

    return entries
  }

  public async getBranchNumStatRaw(baseRef: string): Promise<NumStatEntry[]> {
    const output = await this.git.raw(['diff', '--numstat', `${baseRef}...HEAD`])
    const lines = output.split('\n').map((line) => line.trim()).filter(Boolean)

    const entries: NumStatEntry[] = []

    for (const line of lines) {
      const parts = line.split('\t')
      if (parts.length < 3) continue

      const insertionsRaw = parts[0]
      const deletionsRaw = parts[1]
      const pathParts = parts.slice(2)

      const insertions =
        insertionsRaw === '-' ? 0 : Number.parseInt(insertionsRaw, 10) || 0
      const deletions =
        deletionsRaw === '-' ? 0 : Number.parseInt(deletionsRaw, 10) || 0

      if (pathParts.length >= 2) {
        entries.push({
          insertions,
          deletions,
          oldPath: pathParts[0],
          path: pathParts[1],
        })
        continue
      }

      const pathValue = pathParts.join('\t')
      const renameInfo = this.parseRenamePath(pathValue)
      entries.push({
        insertions,
        deletions,
        path: renameInfo.path,
        oldPath: renameInfo.oldPath,
      })
    }

    return entries
  }

  public async getBranchPatchForPaths(
    baseRef: string,
    paths: string[]
  ): Promise<string> {
    if (paths.length === 0) {
      return ''
    }
    return this.git.raw(['diff', `${baseRef}...HEAD`, '--', ...paths])
  }

  public async getStagedNameStatusRaw(): Promise<NameStatusEntry[]> {
    const output = await this.git.raw(['diff', '--cached', '--name-status'])
    const lines = output.split('\n').map((line) => line.trim()).filter(Boolean)

    const entries: NameStatusEntry[] = []

    for (const line of lines) {
      const parts = line.split('\t').filter(Boolean)
      if (parts.length === 0) continue

      const statusRaw = parts[0]
      const status = statusRaw[0] as NameStatusCode

      if ((status === 'R' || status === 'C') && parts.length >= 3) {
        entries.push({
          status,
          oldPath: parts[1],
          path: parts[2],
        })
        continue
      }

      if (parts.length >= 2) {
        entries.push({
          status,
          path: parts[1],
        })
        continue
      }

      const fallback = line.split(/\s+/)
      if (fallback.length >= 2) {
        entries.push({
          status,
          path: fallback[1],
        })
      }
    }

    return entries
  }

  private parseRenamePath(pathValue: string): { path: string; oldPath?: string } {
    const renameMatch = pathValue.match(/^(.*)\{(.*) => (.*)\}(.*)$/)
    if (renameMatch) {
      const prefix = renameMatch[1]
      const oldPart = renameMatch[2]
      const newPart = renameMatch[3]
      const suffix = renameMatch[4]
      return {
        oldPath: `${prefix}${oldPart}${suffix}`,
        path: `${prefix}${newPart}${suffix}`,
      }
    }

    return { path: pathValue }
  }

  public async getStagedNumStatRaw(): Promise<NumStatEntry[]> {
    const output = await this.git.raw(['diff', '--cached', '--numstat'])
    const lines = output.split('\n').map((line) => line.trim()).filter(Boolean)

    const entries: NumStatEntry[] = []

    for (const line of lines) {
      const parts = line.split('\t')
      if (parts.length < 3) continue

      const insertionsRaw = parts[0]
      const deletionsRaw = parts[1]
      const pathParts = parts.slice(2)

      const insertions =
        insertionsRaw === '-' ? 0 : Number.parseInt(insertionsRaw, 10) || 0
      const deletions =
        deletionsRaw === '-' ? 0 : Number.parseInt(deletionsRaw, 10) || 0

      if (pathParts.length >= 2) {
        entries.push({
          insertions,
          deletions,
          oldPath: pathParts[0],
          path: pathParts[1],
        })
        continue
      }

      const pathValue = pathParts.join('\t')
      const renameInfo = this.parseRenamePath(pathValue)
      entries.push({
        insertions,
        deletions,
        path: renameInfo.path,
        oldPath: renameInfo.oldPath,
      })
    }

    return entries
  }

  public async getStagedPatchForPaths(paths: string[]): Promise<string> {
    if (paths.length === 0) {
      return ''
    }
    return this.git.raw(['diff', '--cached', '--', ...paths])
  }


  /**
   * Gets the diff of all changes in the git repository.
   *
   * @returns The diff of all changes in the git repository.
   */
  public async getAllDiff(): Promise<string> {
    if (!(await this.hasCommits())) {
      // For new repositories, compare against the empty tree object
      const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904' // git hash-object -t tree /dev/null
      return this.git.raw(['diff', emptyTree])
    }
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

    if (!message.body) {
      return message.title
    }

    return [message.title, '', message.body].join('\n')
  }


  /**
   * Gets all changes with processed diff information.
   *
   * @param isMerge - Whether this is a merge commit
   * @param modelType - The AI model being used (affects processing strategy)
   * @returns The processed diff of all changes.
   */
  public async getAllChanges(
    isMerge: boolean = false,
    modelType: string = 'gpt-4o'
  ): Promise<ProcessedDiff> {
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
   * Builds a deterministic merge commit message.
   */
  public async buildMergeCommitMessage(): Promise<CommitMessage> {
    const { source, target } = await this.getMergeHeads()
    const title =
      source && target
        ? `merge: ${source} into ${target}`
        : 'merge: resolve conflicts'

    const hasConflicts = await this.hasMergeConflicts()
    return {
      title,
      body: hasConflicts ? '- resolve merge conflicts' : undefined,
    }
  }

  private async hasMergeConflicts(): Promise<boolean> {
    try {
      const conflicts = await this.git.raw(['ls-files', '-u'])
      return conflicts.trim().length > 0
    } catch (error) {
      return false
    }
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

      return {
        source: sourceBranch.trim().replace('remotes/origin/', ''),
        target: target.trim(),
      }
    } catch (error) {
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
}

export default new GitService()
