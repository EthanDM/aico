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
   * Determines the file type category for semantic understanding.
   *
   * @param filePath - The file path to categorize
   * @returns The file type category
   */
  private getFileType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()

    if (!ext) return 'other'

    const typeMap: Record<string, string> = {
      // Frontend
      tsx: 'react',
      jsx: 'react',
      vue: 'vue',
      html: 'markup',
      css: 'styles',
      scss: 'styles',
      sass: 'styles',
      // Backend
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      java: 'java',
      go: 'golang',
      rs: 'rust',
      php: 'php',
      rb: 'ruby',
      // Config/Data
      json: 'config',
      yaml: 'config',
      yml: 'config',
      toml: 'config',
      xml: 'config',
      env: 'config',
      // Documentation
      md: 'docs',
      rst: 'docs',
      txt: 'docs',
      // Testing
      'test.js': 'test',
      'test.ts': 'test',
      'spec.js': 'test',
      'spec.ts': 'test',
    }

    // Check for test files first
    if (
      filePath.includes('.test.') ||
      filePath.includes('.spec.') ||
      filePath.includes('__tests__')
    ) {
      return 'test'
    }

    return typeMap[ext] || 'other'
  }

  /**
   * Extracts file operations with enhanced metadata.
   *
   * @param diff - The raw diff string
   * @returns Array of file operation strings with metadata
   */
  private extractFileOperations(diff: string): string[] {
    const operations: string[] = []
    const fileRegex = /^diff --git a\/(.*) b\/(.*)/gm
    const fileTypes = new Map<string, number>()
    let match

    while ((match = fileRegex.exec(diff)) !== null) {
      const filePath = match[1]
      if (!this.isNoisyFile(filePath)) {
        const fileType = this.getFileType(filePath)
        fileTypes.set(fileType, (fileTypes.get(fileType) || 0) + 1)
        operations.push(`M ${filePath} (${fileType})`)
      }
    }

    // Add file type summary at the beginning
    if (fileTypes.size > 0) {
      const typeSummary = Array.from(fileTypes.entries())
        .map(([type, count]) => `${count} ${type}`)
        .join(', ')
      operations.unshift(`File types: ${typeSummary}`)
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
   * Extracts function changes with better context.
   *
   * @param diff - The raw diff string
   * @returns Array of function change strings
   */
  private extractFunctionChanges(diff: string): string[] {
    const changes: string[] = []
    const patterns = [
      // JavaScript/TypeScript functions
      /^[\+\-].*(?:function|const|let|var)\s+(\w+)/gm,
      // Class methods and properties
      /^[\+\-].*(?:class|interface)\s+(\w+)/gm,
      // React components
      /^[\+\-].*(?:export\s+(?:default\s+)?(?:function|const))\s+(\w+)/gm,
      // Hooks and utilities
      /^[\+\-].*(?:use[A-Z]\w*|create[A-Z]\w*)\s*[=:]/gm,
    ]

    patterns.forEach((pattern) => {
      let match
      while ((match = pattern.exec(diff)) !== null) {
        const prefix = diff[match.index] === '+' ? 'Added' : 'Removed'
        const name = match[1] || 'anonymous'
        changes.push(`${prefix}: ${name}`)
      }
    })

    return [...new Set(changes)] // Remove duplicates
  }

  /**
   * Analyzes change patterns for semantic understanding.
   *
   * @param diff - The raw diff string
   * @returns Array of change pattern descriptions
   */
  private analyzeChangePatterns(diff: string): string[] {
    const patterns: string[] = []

    // Count line changes for scale assessment
    const addedLines = (diff.match(/^\+(?!\+\+)/gm) || []).length
    const removedLines = (diff.match(/^-(?!--)/gm) || []).length

    if (addedLines > removedLines * 2) {
      patterns.push('Primarily additions (new functionality)')
    } else if (removedLines > addedLines * 2) {
      patterns.push('Primarily deletions (cleanup/removal)')
    } else if (addedLines > 0 && removedLines > 0) {
      patterns.push('Mixed additions and deletions (refactoring)')
    }

    // Check for specific patterns
    if (diff.includes('import') || diff.includes('require')) {
      patterns.push('Dependencies modified')
    }

    if (
      diff.includes('test') ||
      diff.includes('spec') ||
      diff.includes('describe')
    ) {
      patterns.push('Tests involved')
    }

    if (
      diff.includes('style') ||
      diff.includes('css') ||
      diff.includes('className')
    ) {
      patterns.push('Styling changes')
    }

    if (
      diff.includes('TODO') ||
      diff.includes('FIXME') ||
      diff.includes('XXX')
    ) {
      patterns.push('Code comments/TODOs updated')
    }

    return patterns
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
   * Summarizes a diff into a human-readable format with enhanced structure.
   *
   * @param diff - The processed diff object
   * @returns A summary string
   */
  private summarizeDiff(diff: GitDiff): string {
    const parts: string[] = []

    if (diff.fileOperations.length > 0) {
      parts.push('=== Files Changed ===')
      parts.push(...diff.fileOperations)
      parts.push('')
    }

    if (diff.changePatterns && diff.changePatterns.length > 0) {
      parts.push('=== Change Patterns ===')
      parts.push(...diff.changePatterns)
      parts.push('')
    }

    if (diff.functionChanges.length > 0) {
      parts.push('=== Code Changes ===')
      parts.push(...diff.functionChanges.slice(0, 10)) // Limit for focus
      if (diff.functionChanges.length > 10) {
        parts.push(`... and ${diff.functionChanges.length - 10} more changes`)
      }
      parts.push('')
    }

    if (diff.dependencyChanges.length > 0) {
      parts.push('=== Dependencies ===')
      parts.push(...diff.dependencyChanges)
      parts.push('')
    }

    return parts.join('\n')
  }

  /**
   * Extracts the most meaningful parts of a diff for AI analysis.
   *
   * @param diff - The raw diff string
   * @param limit - Character limit for meaningful extraction
   * @returns Object with meaningful diff sections and remaining summary
   */
  private extractMeaningfulDiff(
    diff: string,
    limit: number
  ): {
    meaningfulSections: string[]
    remainingDiff: string
    totalExtracted: number
  } {
    const lines = diff.split('\n')
    const meaningfulSections: string[] = []
    const processedLines = new Set<number>()
    let totalChars = 0

    // Priority patterns for meaningful extraction
    const priorities = [
      // Function definitions and changes
      {
        pattern: /^[+-].*(?:function|const|let|var|class|interface)\s+\w+/,
        priority: 1,
      },
      // Import/export changes
      { pattern: /^[+-].*(?:import|export|from|require)/, priority: 1 },
      // React component changes
      { pattern: /^[+-].*(?:return\s*\(|jsx|tsx|<\w+)/, priority: 2 },
      // Type definitions
      { pattern: /^[+-].*(?:type|interface|enum)\s+\w+/, priority: 2 },
      // Configuration changes
      { pattern: /^[+-].*(?:"[^"]*":\s*|config|setup|options)/, priority: 3 },
    ]

    // Extract by priority
    for (const { pattern, priority } of priorities) {
      for (let i = 0; i < lines.length; i++) {
        if (processedLines.has(i)) continue

        const line = lines[i]
        if (pattern.test(line)) {
          // Include context around meaningful lines (2 lines before/after)
          const contextStart = Math.max(0, i - 2)
          const contextEnd = Math.min(lines.length - 1, i + 2)

          const contextLines = []
          for (let j = contextStart; j <= contextEnd; j++) {
            if (!processedLines.has(j)) {
              contextLines.push(lines[j])
              processedLines.add(j)
            }
          }

          const section = contextLines.join('\n')
          if (totalChars + section.length < limit) {
            meaningfulSections.push(`=== Priority ${priority} Change ===`)
            meaningfulSections.push(section)
            meaningfulSections.push('') // Empty line separator
            totalChars += section.length + 30 // Account for headers
          } else {
            break
          }
        }
      }

      if (totalChars >= limit * 0.8) break // Stop if we're near the limit
    }

    // Create remaining diff without processed lines
    const remainingLines = lines.filter(
      (_, index) => !processedLines.has(index)
    )
    const remainingDiff = remainingLines.join('\n')

    return {
      meaningfulSections,
      remainingDiff,
      totalExtracted: totalChars,
    }
  }

  /**
   * Creates a hybrid summary combining meaningful diff sections with structured analysis.
   *
   * @param diff - The processed diff object
   * @param meaningfulSections - Extracted meaningful diff sections
   * @returns Combined summary string
   */
  private createHybridSummary(
    diff: GitDiff,
    meaningfulSections: string[]
  ): string {
    const parts: string[] = []

    // Start with file overview
    if (diff.fileOperations.length > 0) {
      parts.push('=== Files Changed ===')
      parts.push(...diff.fileOperations.slice(0, 5)) // Limit for focus
      parts.push('')
    }

    // Add change patterns for context
    if (diff.changePatterns && diff.changePatterns.length > 0) {
      parts.push('=== Change Analysis ===')
      parts.push(...diff.changePatterns)
      parts.push('')
    }

    // Include meaningful diff sections
    if (meaningfulSections.length > 0) {
      parts.push('=== Key Code Changes ===')
      parts.push(...meaningfulSections)
    }

    // Add structured summaries for remaining context
    if (diff.functionChanges.length > 0) {
      parts.push('=== Additional Functions Modified ===')
      parts.push(...diff.functionChanges.slice(0, 8))
      if (diff.functionChanges.length > 8) {
        parts.push(`... and ${diff.functionChanges.length - 8} more`)
      }
      parts.push('')
    }

    if (diff.dependencyChanges.length > 0) {
      parts.push('=== Dependencies ===')
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
   * @param modelType - The AI model being used (affects processing strategy)
   * @returns The processed diff
   */
  public processDiff(
    diff: string,
    isMerge: boolean = false,
    modelType: string = 'gpt-4o'
  ): ProcessedDiff {
    // Optimized limits based on model attention characteristics and real-world usage
    const OPTIMAL_LIMIT = modelType.includes('mini') ? 30000 : 50000 // Sweet spot for attention quality
    const EXTENDED_LIMIT = modelType.includes('mini') ? 45000 : 70000 // Upper bound before quality degrades
    const FALLBACK_LIMIT = modelType.includes('mini') ? 20000 : 30000 // For structured summaries

    const filteredRawDiff = this.filterNoisyFiles(diff)
    const fileOperations = this.extractFileOperations(diff)
    const functionChanges = this.extractFunctionChanges(filteredRawDiff)
    const dependencyChanges = this.extractDependencyChanges(filteredRawDiff)
    const changePatterns = this.analyzeChangePatterns(filteredRawDiff)

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
      changePatterns,
    }

    let summary: string
    let wasSummarized = false

    if (filteredRawDiff.length <= OPTIMAL_LIMIT) {
      // Optimal range - use full diff for best accuracy and attention
      summary = filteredRawDiff
    } else if (filteredRawDiff.length <= EXTENDED_LIMIT) {
      // Extended range - use priority extraction + summary for focused accuracy
      // This gives us the most important changes in raw form while summarizing the rest
      const { meaningfulSections } = this.extractMeaningfulDiff(
        filteredRawDiff,
        Math.floor(OPTIMAL_LIMIT * 0.6) // Use 60% for priority sections, 40% for summary
      )
      summary = this.createHybridSummary(details, meaningfulSections)
      wasSummarized = true
    } else if (filteredRawDiff.length <= FALLBACK_LIMIT * 2) {
      // Large diff - use more conservative hybrid approach
      const { meaningfulSections } = this.extractMeaningfulDiff(
        filteredRawDiff,
        Math.floor(FALLBACK_LIMIT * 0.8) // Reserve 20% for structure
      )
      summary = this.createHybridSummary(details, meaningfulSections)
      wasSummarized = true
    } else {
      // Very large diff - use structured summary and suggest splitting
      summary = this.summarizeDiff(details)
      wasSummarized = true
    }

    // Calculate stats with quality indicators
    const stats = {
      originalLength: diff.length,
      filteredLength: filteredRawDiff.length,
      processedLength: summary.length,
      filesChanged: Math.max(0, fileOperations.length - 1),
      additions: additions.length,
      deletions: deletions.length,
      wasSummarized,
      qualityIndicator: this.getQualityIndicator(
        filteredRawDiff.length,
        modelType
      ),
    }

    return {
      summary,
      details,
      stats,
      isMerge,
    }
  }

  /**
   * Provides a quality indicator based on diff size and model type.
   *
   * @param diffLength - Length of the filtered diff
   * @param modelType - The AI model being used
   * @returns Quality indicator string
   */
  private getQualityIndicator(diffLength: number, modelType: string): string {
    const isMini = modelType.includes('mini')
    const optimal = isMini ? 30000 : 50000
    const extended = isMini ? 45000 : 70000

    if (diffLength <= optimal) {
      return 'optimal' // Full diff, highest accuracy
    } else if (diffLength <= extended) {
      return 'focused' // Priority extraction + summary, high accuracy
    } else {
      return 'summarized' // Structured summary, good accuracy but some detail loss
    }
  }
}

export default new DiffProcessor()
