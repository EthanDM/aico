import { ProcessedDiff } from '../types'

const VAGUE_DESCRIPTION_WORDS = [
  'handling',
  'logic',
  'process',
  'stuff',
  'various',
]

export interface ChangeClassification {
  isInternalChange: boolean
  isDocsOnly: boolean
  isDocsTouched: boolean
  isQualityTuning: boolean
  docsScope?: string
  docsTouchedList: string[]
}

/**
 * Service for classifying changes based on diff signals.
 * Provides heuristics for detecting internal changes, docs changes, etc.
 */
export class CommitHeuristics {
  /**
   * Classifies a diff and returns all classification results.
   *
   * @param diff - The processed diff to classify
   * @returns Classification results
   */
  classify(diff: ProcessedDiff): ChangeClassification {
    return {
      isInternalChange: this.isInternalToolingChange(diff),
      isDocsOnly: this.isDocsOnlyChange(diff),
      isDocsTouched: this.isDocsTouched(diff),
      isQualityTuning: this.isQualityTuningChange(diff),
      docsScope: this.getDocsScope(diff),
      docsTouchedList: this.getDocsTouchedList(diff),
    }
  }

  /**
   * Detects if the change is primarily internal tooling/architecture.
   *
   * @param diff - The processed diff
   * @returns True if internal tooling change
   */
  isInternalToolingChange(diff: ProcessedDiff): boolean {
    const paths = diff.signals?.topFiles?.length
      ? diff.signals.topFiles
      : diff.signals?.nameStatus?.map((entry) => entry.path) || []
    if (paths.length === 0) {
      return false
    }

    const internalPrefixes = [
      'src/services/',
      'src/processors/',
      'src/types/',
      'src/constants/',
    ]
    const userFacingHints = ['src/cli.ts', 'src/cli/']

    const hasUserFacingHint = paths.some((path) =>
      userFacingHints.some((hint) => path.startsWith(hint))
    )
    if (hasUserFacingHint) {
      return false
    }

    const internalCount = paths.filter((path) =>
      internalPrefixes.some((prefix) => path.startsWith(prefix))
    ).length

    return internalCount / paths.length >= 0.5
  }

  /**
   * Detects if the change is documentation-only.
   *
   * @param diff - The processed diff
   * @returns True if docs-only change
   */
  isDocsOnlyChange(diff: ProcessedDiff): boolean {
    const paths = diff.signals?.nameStatus?.map((entry) => entry.path) || []
    if (paths.length === 0) {
      return false
    }

    return paths.every((path) => {
      if (path === 'README.md') return true
      if (/^docs\//.test(path)) return true
      if (/\.md$/i.test(path)) return true
      if (/^CHANGELOG/i.test(path) || /^HISTORY/i.test(path)) return true
      return false
    })
  }

  /**
   * Detects if any documentation files are touched.
   *
   * @param diff - The processed diff
   * @returns True if docs are touched
   */
  isDocsTouched(diff: ProcessedDiff): boolean {
    const paths = diff.signals?.nameStatus?.map((entry) => entry.path) || []
    return paths.some((path) => {
      if (path === 'README.md') return true
      if (/^docs\//.test(path)) return true
      if (/\.md$/i.test(path)) return true
      if (/^CHANGELOG/i.test(path) || /^HISTORY/i.test(path)) return true
      return false
    })
  }

  /**
   * Gets the list of documentation files touched.
   *
   * @param diff - The processed diff
   * @returns Array of doc file paths
   */
  getDocsTouchedList(diff: ProcessedDiff): string[] {
    const paths = diff.signals?.nameStatus?.map((entry) => entry.path) || []
    return paths.filter((path) => {
      if (path === 'README.md') return true
      if (/^docs\//.test(path)) return true
      if (/\.md$/i.test(path)) return true
      if (/^CHANGELOG/i.test(path) || /^HISTORY/i.test(path)) return true
      return false
    })
  }

  /**
   * Gets the appropriate scope for documentation changes.
   *
   * @param diff - The processed diff
   * @returns Scope string ('readme' or 'docs')
   */
  getDocsScope(diff: ProcessedDiff): string {
    const paths = diff.signals?.nameStatus?.map((entry) => entry.path) || []
    if (paths.some((path) => path === 'README.md')) {
      return 'readme'
    }
    return 'docs'
  }

  /**
   * Detects if the change is related to commit quality tuning.
   *
   * @param diff - The processed diff
   * @returns True if quality tuning change
   */
  isQualityTuningChange(diff: ProcessedDiff): boolean {
    const paths = diff.signals?.nameStatus?.map((entry) => entry.path) || []
    const touched = paths.some((path) =>
      [
        'src/services/OpenAI.service.ts',
        'src/constants/openai.constants.ts',
        'src/processors/Diff.processor.ts',
        'src/services/Git.service.ts',
      ].includes(path)
    )
    if (!touched) {
      return false
    }
    const snippets = diff.signals?.patchSnippets?.join('\n') || ''
    return /(validateCommitMessage|repairSubject|truncateSubject|scopeRules|templates|prompt|banned|vague|refineDescription)/.test(
      snippets
    )
  }

  /**
   * Checks if a description is too vague.
   *
   * @param description - The description text to check
   * @returns True if vague
   */
  isVagueDescription(description: string): boolean {
    const tokens = description
      .split(/\s+/)
      .map((token) => token.toLowerCase())
      .filter(Boolean)
    if (tokens.length === 0) return true
    if (tokens.every((token) => VAGUE_DESCRIPTION_WORDS.includes(token))) {
      return true
    }
    if (tokens.length <= 3) {
      return tokens.some((token) => VAGUE_DESCRIPTION_WORDS.includes(token))
    }
    return false
  }
}
