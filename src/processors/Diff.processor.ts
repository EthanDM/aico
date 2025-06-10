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
    const fileName = filePath.toLowerCase()
    const ext = fileName.split('.').pop()

    if (!ext) return 'other'

    // Priority checks for test files (check before extension mapping)
    if (
      fileName.includes('.test.') ||
      fileName.includes('.spec.') ||
      fileName.includes('__tests__') ||
      fileName.includes('__mocks__') ||
      fileName.includes('.stories.') ||
      fileName.includes('cypress/') ||
      fileName.includes('e2e/') ||
      fileName.includes('playwright/')
    ) {
      return 'test'
    }

    // Configuration files (check before generic extensions)
    if (
      fileName.includes('config') ||
      fileName.includes('webpack') ||
      fileName.includes('vite') ||
      fileName.includes('rollup') ||
      fileName.includes('babel') ||
      fileName.includes('eslint') ||
      fileName.includes('prettier') ||
      fileName.includes('tsconfig') ||
      fileName.includes('jest') ||
      fileName.includes('package.json') ||
      fileName.includes('docker') ||
      fileName.includes('.env')
    ) {
      return 'config'
    }

    const typeMap: Record<string, string> = {
      // Frontend frameworks
      tsx: 'react',
      jsx: 'react',
      vue: 'vue',
      svelte: 'svelte',
      astro: 'astro',

      // Markup and styles
      html: 'markup',
      htm: 'markup',
      css: 'styles',
      scss: 'styles',
      sass: 'styles',
      less: 'styles',
      styl: 'styles',
      stylus: 'styles',

      // Backend languages
      js: 'javascript',
      mjs: 'javascript',
      cjs: 'javascript',
      ts: 'typescript',
      py: 'python',
      java: 'java',
      go: 'golang',
      rs: 'rust',
      php: 'php',
      rb: 'ruby',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      kt: 'kotlin',
      swift: 'swift',

      // Configuration formats
      json: 'config',
      yaml: 'config',
      yml: 'config',
      toml: 'config',
      ini: 'config',
      xml: 'config',
      conf: 'config',

      // Documentation
      md: 'docs',
      mdx: 'docs',
      rst: 'docs',
      txt: 'docs',
      adoc: 'docs',

      // Database and queries
      sql: 'database',
      graphql: 'database',
      gql: 'database',

      // Stylesheets and templates
      handlebars: 'template',
      hbs: 'template',
      mustache: 'template',
      twig: 'template',
      ejs: 'template',

      // Mobile development
      dart: 'mobile',
      kotlin: 'mobile',
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
      // JavaScript/TypeScript functions - improved patterns
      {
        pattern:
          /^[\+\-].*(?:function\s+(\w+)|const\s+(\w+)\s*=.*(?:function|\(.*\)\s*=>)|let\s+(\w+)\s*=.*(?:function|\(.*\)\s*=>)|var\s+(\w+)\s*=.*(?:function|\(.*\)\s*=>))/gm,
        name: 'function',
      },

      // Class and interface definitions
      {
        pattern:
          /^[\+\-].*(?:class\s+(\w+)|interface\s+(\w+)|enum\s+(\w+)|type\s+(\w+)\s*=)/gm,
        name: 'type',
      },

      // React components and hooks - more specific
      {
        pattern:
          /^[\+\-].*(?:export\s+(?:default\s+)?(?:function|const)\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*=.*(?:React\.FC|React\.Component|\(.*\)\s*=>\s*{|\(.*\)\s*=>\s*\())/gm,
        name: 'component',
      },

      // React hooks
      {
        pattern:
          /^[\+\-].*(?:const\s+(use[A-Z]\w*)\s*=|function\s+(use[A-Z]\w*)\s*\()/gm,
        name: 'hook',
      },

      // Method definitions in classes/objects
      {
        pattern:
          /^[\+\-].*(?:(\w+)\s*\(.*\)\s*{|(\w+):\s*(?:function|\(.*\)\s*=>))/gm,
        name: 'method',
      },

      // Arrow functions assigned to variables
      { pattern: /^[\+\-].*const\s+(\w+)\s*=\s*\(.*\)\s*=>/gm, name: 'arrow' },
    ]

    patterns.forEach(({ pattern, name }) => {
      let match
      pattern.lastIndex = 0 // Reset regex state

      while ((match = pattern.exec(diff)) !== null) {
        const prefix = diff[match.index] === '+' ? 'Added' : 'Removed'
        // Find the first non-empty capture group
        const functionName =
          match.slice(1).find((group) => group && group.trim()) || 'anonymous'

        if (functionName && functionName !== 'anonymous') {
          changes.push(`${prefix}: ${functionName} (${name})`)
        }
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
    const totalLines = addedLines + removedLines

    // Change scale analysis
    if (addedLines > removedLines * 2) {
      patterns.push('Primarily additions (new functionality)')
    } else if (removedLines > addedLines * 2) {
      patterns.push('Primarily deletions (cleanup/removal)')
    } else if (addedLines > 0 && removedLines > 0) {
      patterns.push('Mixed additions and deletions (refactoring)')
    }

    // Dependency and import analysis
    const importCount = (diff.match(/^[\+\-].*(?:import|require|from)/gm) || [])
      .length
    if (importCount > 0) {
      if (importCount > totalLines * 0.3) {
        patterns.push('Major dependency restructuring')
      } else {
        patterns.push('Dependencies modified')
      }
    }

    // Test-related changes
    if (
      diff.includes('test') ||
      diff.includes('spec') ||
      diff.includes('describe') ||
      diff.includes('it(') ||
      diff.includes('expect(') ||
      diff.includes('jest') ||
      diff.includes('cypress') ||
      diff.includes('playwright')
    ) {
      patterns.push('Tests involved')
    }

    // Styling and UI changes
    if (
      diff.includes('style') ||
      diff.includes('css') ||
      diff.includes('className') ||
      diff.includes('styled') ||
      diff.includes('theme') ||
      diff.includes('color') ||
      diff.includes('margin') ||
      diff.includes('padding')
    ) {
      patterns.push('Styling changes')
    }

    // Configuration changes
    if (
      diff.includes('config') ||
      diff.includes('env') ||
      diff.includes('webpack') ||
      diff.includes('babel') ||
      diff.includes('eslint') ||
      diff.includes('prettier') ||
      diff.includes('package.json') ||
      diff.includes('tsconfig')
    ) {
      patterns.push('Configuration changes')
    }

    // API and backend changes
    if (
      diff.includes('api') ||
      diff.includes('endpoint') ||
      diff.includes('route') ||
      diff.includes('controller') ||
      diff.includes('service') ||
      diff.includes('middleware') ||
      diff.includes('database') ||
      diff.includes('model')
    ) {
      patterns.push('Backend/API changes')
    }

    // Documentation changes
    if (
      diff.includes('README') ||
      diff.includes('doc') ||
      diff.includes('comment') ||
      diff.includes('/**') ||
      diff.includes('TODO') ||
      diff.includes('FIXME') ||
      diff.includes('XXX') ||
      diff.includes('NOTE')
    ) {
      patterns.push('Documentation/comments updated')
    }

    // Security-related changes
    if (
      diff.includes('auth') ||
      diff.includes('security') ||
      diff.includes('token') ||
      diff.includes('password') ||
      diff.includes('permission') ||
      diff.includes('validation') ||
      diff.includes('sanitize') ||
      diff.includes('csrf')
    ) {
      patterns.push('Security-related changes')
    }

    // Performance-related changes
    if (
      diff.includes('performance') ||
      diff.includes('optimize') ||
      diff.includes('cache') ||
      diff.includes('lazy') ||
      diff.includes('memo') ||
      diff.includes('debounce') ||
      diff.includes('throttle') ||
      diff.includes('async') ||
      diff.includes('await')
    ) {
      patterns.push('Performance-related changes')
    }

    // UI/UX changes
    if (
      diff.includes('component') ||
      diff.includes('jsx') ||
      diff.includes('tsx') ||
      diff.includes('react') ||
      diff.includes('vue') ||
      diff.includes('render') ||
      diff.includes('props') ||
      diff.includes('state') ||
      diff.includes('hook')
    ) {
      patterns.push('UI/Component changes')
    }

    // Error handling and debugging
    if (
      diff.includes('error') ||
      diff.includes('exception') ||
      diff.includes('catch') ||
      diff.includes('try') ||
      diff.includes('debug') ||
      diff.includes('console.log') ||
      diff.includes('logger') ||
      diff.includes('warn') ||
      diff.includes('fatal')
    ) {
      patterns.push('Error handling/debugging')
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
      // Priority 1: Core functionality changes
      {
        pattern:
          /^[+-].*(?:function\s+\w+|const\s+\w+\s*=.*(?:function|\(.*\)\s*=>)|class\s+\w+|interface\s+\w+|export\s+(?:default\s+)?(?:function|class|const))/,
        priority: 1,
        description: 'Core function/class definitions',
      },

      // Priority 1: Import/export changes (architecture changes)
      {
        pattern: /^[+-].*(?:import|export|from|require)/,
        priority: 1,
        description: 'Import/export changes',
      },

      // Priority 1: API routes and endpoints
      {
        pattern:
          /^[+-].*(?:router\.|app\.|\.get\(|\.post\(|\.put\(|\.delete\(|api|endpoint)/,
        priority: 1,
        description: 'API/route definitions',
      },

      // Priority 2: React components and hooks
      {
        pattern:
          /^[+-].*(?:return\s*\(|jsx|tsx|<[A-Z]\w*|use[A-Z]\w*|React\.|useState|useEffect)/,
        priority: 2,
        description: 'React components/hooks',
      },

      // Priority 2: Type definitions and interfaces
      {
        pattern: /^[+-].*(?:type\s+\w+\s*=|interface\s+\w+|enum\s+\w+)/,
        priority: 2,
        description: 'Type definitions',
      },

      // Priority 2: Database models and schemas
      {
        pattern: /^[+-].*(?:schema|model|table|migration|sql|query|database)/,
        priority: 2,
        description: 'Database/model changes',
      },

      // Priority 3: Configuration and setup
      {
        pattern:
          /^[+-].*(?:"[^"]*":\s*|config|setup|options|settings|\.env|package\.json)/,
        priority: 3,
        description: 'Configuration changes',
      },

      // Priority 3: Test files and specs
      {
        pattern:
          /^[+-].*(?:describe\(|it\(|test\(|expect\(|jest|cypress|spec|\.test\.)/,
        priority: 3,
        description: 'Test changes',
      },

      // Priority 3: Error handling and validation
      {
        pattern:
          /^[+-].*(?:try\s*{|catch\s*\(|throw|error|exception|validate|sanitize)/,
        priority: 3,
        description: 'Error handling/validation',
      },

      // Priority 4: Styling and visual changes
      {
        pattern:
          /^[+-].*(?:style|css|className|styled|theme|color|margin|padding|flex|grid)/,
        priority: 4,
        description: 'Styling changes',
      },

      // Priority 4: Documentation and comments
      {
        pattern: /^[+-].*(?:\/\*\*|\/\/|TODO|FIXME|NOTE|README|documentation)/,
        priority: 4,
        description: 'Documentation/comments',
      },
    ]

    // Extract by priority
    for (const { pattern, priority, description } of priorities) {
      for (let i = 0; i < lines.length; i++) {
        if (processedLines.has(i)) continue

        const line = lines[i]
        if (pattern.test(line)) {
          // Include context around meaningful lines (2 lines before/after for priority 1-2, 1 line for priority 3-4)
          const contextRadius = priority <= 2 ? 2 : 1
          const contextStart = Math.max(0, i - contextRadius)
          const contextEnd = Math.min(lines.length - 1, i + contextRadius)

          const contextLines = []
          for (let j = contextStart; j <= contextEnd; j++) {
            if (!processedLines.has(j)) {
              contextLines.push(lines[j])
              processedLines.add(j)
            }
          }

          const section = contextLines.join('\n')
          if (totalChars + section.length < limit) {
            meaningfulSections.push(`=== ${description} ===`)
            meaningfulSections.push(section)
            meaningfulSections.push('') // Empty line separator
            totalChars += section.length + description.length + 10 // Account for headers
          } else {
            break
          }
        }
      }

      // Stop early if we've used most of our allocation or covered high-priority items
      if (
        totalChars >= limit * 0.9 ||
        (priority <= 2 && totalChars >= limit * 0.7)
      )
        break
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
