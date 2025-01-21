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
   * Processes a raw diff string into a structured format.
   *
   * @param rawDiff - The raw diff string
   * @returns A processed diff object
   */
  public processDiff(rawDiff: string): ProcessedDiff {
    const CHARACTER_LIMIT = 20000
    const fileOperations = this.extractFileOperations(rawDiff)
    const functionChanges = this.extractFunctionChanges(rawDiff)
    const dependencyChanges = this.extractDependencyChanges(rawDiff)

    // Extract additions and deletions
    const additions: string[] = []
    const deletions: string[] = []
    rawDiff.split('\n').forEach((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) additions.push(line)
      if (line.startsWith('-') && !line.startsWith('---')) deletions.push(line)
    })

    const details: GitDiff = {
      fileOperations,
      functionChanges,
      dependencyChanges,
      additions,
      deletions,
      rawDiff,
    }

    // Use raw diff if under limit, otherwise use summary
    const shouldSummarize = rawDiff.length > CHARACTER_LIMIT
    const summary = shouldSummarize ? this.summarizeDiff(details) : rawDiff

    // Calculate stats
    const stats = {
      originalLength: rawDiff.length,
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
    }
  }
}

export default new DiffProcessor()
