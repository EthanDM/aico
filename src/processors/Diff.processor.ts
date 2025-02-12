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

    // Special file types that should be highlighted
    const dependencyFiles = [
      'Podfile',
      'Podfile.lock',
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Gemfile',
      'Gemfile.lock'
    ]

    // Debug logging for raw diff
    console.log('Raw diff:', diff)

    while ((match = fileRegex.exec(diff)) !== null) {
      const filePath = match[1]
      console.log('Found file in diff:', filePath)
      
      if (!this.isNoisyFile(filePath)) {
        // Check if it's a special dependency file
        const fileName = filePath.split('/').pop() || ''
        console.log('Checking file:', fileName)
        
        if (dependencyFiles.includes(fileName)) {
          operations.push(`M ${filePath} (dependency file)`)
          console.log('Added dependency file:', filePath)
        } else {
          operations.push(`M ${filePath}`)
          console.log('Added regular file:', filePath)
        }
      } else {
        console.log('Skipped noisy file:', filePath)
      }
    }

    console.log('Final operations:', operations)
    return operations
  }

  /**
   * Filters out noisy files from the raw diff.
   *
   * @param rawDiff - The raw diff string
   * @returns The filtered diff string
   */
  private filterNoisyFiles(rawDiff: string): string {
    // Debug logging
    console.log('Filtering diff, original length:', rawDiff.length)
    
    const diffSections = rawDiff.split(/(?=diff --git )/g)
    const filtered = diffSections
      .filter((section) => {
        const match = section.match(/^diff --git a\/(.*) b\//)
        if (match) {
          console.log('Checking section for file:', match[1])
          const isNoisy = this.isNoisyFile(match[1])
          if (isNoisy) {
            console.log('Filtered out noisy file:', match[1])
          }
          return !isNoisy
        }
        return true
      })
      .join('')

    console.log('Filtered diff length:', filtered.length)
    return filtered
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
    
    // Store the raw diff before any filtering
    const rawDiff = diff

    // Extract file operations before filtering
    const fileOperations = this.extractFileOperations(diff)
    
    // Filter out noisy files for the summary
    const filteredRawDiff = this.filterNoisyFiles(diff)
    
    const functionChanges = this.extractFunctionChanges(filteredRawDiff)
    const dependencyChanges = this.extractDependencyChanges(filteredRawDiff)

    // Count additions and deletions
    const additionLines = (rawDiff.match(/^\+(?![\+\-\s])/gm) || []).length
    const deletionLines = (rawDiff.match(/^\-(?![\+\-\s])/gm) || []).length
    const filesChanged = (rawDiff.match(/^diff --git/gm) || []).length

    // Check if we need to summarize
    const wasSummarized = filteredRawDiff.length > CHARACTER_LIMIT
    const summary = wasSummarized
      ? this.summarizeDiff({
          fileOperations,
          functionChanges,
          dependencyChanges,
          additions: [],
          deletions: [],
          rawDiff,
          filteredRawDiff
        })
      : filteredRawDiff

    return {
      summary,
      details: {
        fileOperations,
        functionChanges,
        dependencyChanges,
        additions: [],
        deletions: [],
        rawDiff,
        filteredRawDiff
      },
      stats: {
        originalLength: rawDiff.length,
        processedLength: summary.length,
        filesChanged,
        additions: additionLines,
        deletions: deletionLines,
        wasSummarized
      },
      isMerge
    }
  }
}

export default new DiffProcessor()
