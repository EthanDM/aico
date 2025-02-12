import { ProcessedDiff, GitDiff } from '../types'
import { NOISY_FILE_PATTERNS } from '../constants/patterns'

/**
 * A processor for analyzing and summarizing diffs.
 * This is a general-purpose diff processor that can work with any Git-like diff format.
 */
class DiffProcessor {
  /**
   * Checks if a file path matches any noisy file patterns.
   *
   * @param filePath - The file path to check
   * @returns True if the file is considered noisy
   */
  private isNoisyFile(filePath: string): boolean {
    return NOISY_FILE_PATTERNS.some((pattern) => pattern.test(filePath))
  }

  /**
   * Extracts file operations from a diff.
   *
   * @param diff - The raw diff string
   * @returns Array of file operation strings
   */
  private extractFileOperations(diff: string): string[] {
    const operations: string[] = []
    const fileRegex = /^diff --git a\/(.*) b\/(.*)/gm
    let match

    while ((match = fileRegex.exec(diff)) !== null) {
      const filePath = match[1]
      if (!this.isNoisyFile(filePath)) {
        operations.push(`M ${filePath}`)
      }
    }

    return operations
  }

  /**
   * Filters out noisy files from the raw diff.
   *
   * @param rawDiff - The raw diff string
   * @returns The filtered diff string
   */
  private filterNoisyFiles(rawDiff: string): string {
    const diffSections = rawDiff.split(/(?=diff --git )/g)
    return diffSections
      .filter((section) => {
        const match = section.match(/^diff --git a\/(.*) b\//)
        return match ? !this.isNoisyFile(match[1]) : true
      })
      .join('')
  }

  /**
   * Extracts function changes from a diff.
   *
   * @param diff - The raw diff string
   * @returns Array of function change strings
   */
  private extractFunctionChanges(diff: string): string[] {
    const changes: string[] = []
    const functionRegex = /^[\+\-].*(?:function|class|const|let|var)\s+(\w+)/gm
    let match

    while ((match = functionRegex.exec(diff)) !== null) {
      const prefix = diff[match.index] === '+' ? '+' : '-'
      changes.push(`${prefix} ${match[1]}`)
    }

    return changes
  }

  /**
   * Extracts dependency changes from a diff.
   *
   * @param diff - The raw diff string
   * @returns Array of dependency change strings
   */
  private extractDependencyChanges(diff: string): string[] {
    const changes: string[] = []
    const dependencyRegex =
      /^[\+\-].*(?:import|require|from)\s+['"]([^'"]+)['"]/gm
    let match

    while ((match = dependencyRegex.exec(diff)) !== null) {
      const prefix = diff[match.index] === '+' ? '+' : '-'
      changes.push(`${prefix} ${match[1]}`)
    }

    return changes
  }

  /**
   * Summarizes a diff into a human-readable format.
   *
   * @param diff - The processed diff object
   * @returns A summary string
   */
  private summarizeDiff(diff: GitDiff): string {
    const parts: string[] = []

    if (diff.fileOperations.length > 0) {
      parts.push('=== File Operations ===')
      parts.push(...diff.fileOperations)
      parts.push('')
    }

    if (diff.functionChanges.length > 0) {
      parts.push('=== Function Changes ===')
      parts.push(...diff.functionChanges)
      parts.push('')
    }

    if (diff.dependencyChanges.length > 0) {
      parts.push('=== Dependency Changes ===')
      parts.push(...diff.dependencyChanges)
      parts.push('')
    }

    return parts.join('\n')
  }

  /**
   * Process a git diff into a more structured format.
   *
   * @param diff - The raw git diff to process
   * @param isMerge - Whether this is a merge commit
   * @returns The processed diff
   */
  public processDiff(diff: string, isMerge: boolean = false): ProcessedDiff {
    const CHARACTER_LIMIT = 20000
    const filteredRawDiff = new DiffProcessor().filterNoisyFiles(diff)
    const fileOperations = new DiffProcessor().extractFileOperations(diff)
    const functionChanges = new DiffProcessor().extractFunctionChanges(
      filteredRawDiff
    )
    const dependencyChanges = new DiffProcessor().extractDependencyChanges(
      filteredRawDiff
    )

    // Extract additions and deletions from filtered diff
    const additions: string[] = []
    const deletions: string[] = []
    filteredRawDiff.split('\n').forEach((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) additions.push(line)
      if (line.startsWith('-') && !line.startsWith('---')) deletions.push(line)
    })

    const details: GitDiff = {
      fileOperations,
      functionChanges,
      dependencyChanges,
      additions,
      deletions,
      rawDiff: diff,
      filteredRawDiff: filteredRawDiff,
    }

    // Use filtered raw diff if under limit, otherwise use summary
    const shouldSummarize = filteredRawDiff.length > CHARACTER_LIMIT
    const summary = shouldSummarize
      ? new DiffProcessor().summarizeDiff(details)
      : filteredRawDiff

    // Calculate stats
    const stats = {
      originalLength: diff.length,
      filteredLength: filteredRawDiff.length,
      processedLength: summary.length,
      filesChanged: fileOperations.length,
      additions: additions.length,
      deletions: deletions.length,
      wasSummarized: shouldSummarize,
    }

    return {
      summary,
      details,
      stats,
      isMerge,
    }
  }
}

export default new DiffProcessor()
