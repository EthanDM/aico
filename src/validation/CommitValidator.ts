import { CommitMessage } from '../types'

type CommitConfig = {
  maxTitleLength: number
  includeBody: 'auto' | 'never' | 'always'
}

const SUBJECT_PATTERN =
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: .+$/

const BANNED_SUBJECT_WORDS = [
  'update',
  'updates',
  'updated',
  'enhance',
  'enhanced',
  'improve',
  'improved',
  'misc',
  'changes',
]

const VAGUE_SUBJECT_PATTERNS = [
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: changes$/i,
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: minor changes$/i,
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: various changes$/i,
]

export interface ValidationContext {
  maxTitleLength: number
  includeBodyMode: 'auto' | 'never' | 'always'
  includeBodyAllowed: boolean
  internalChange?: boolean
  docsOnly?: boolean
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Service for validating commit messages against Conventional Commits format
 * and project-specific rules.
 */
export class CommitValidator {
  constructor(private config: CommitConfig) { }

  /**
   * Validates a commit message against all rules.
   *
   * @param message - The commit message to validate
   * @param context - Validation context with options
   * @returns Validation result with errors if any
   */
  validate(
    message: CommitMessage,
    context: ValidationContext
  ): ValidationResult {
    const errors: string[] = []
    const title = message.title.trim()

    if (!SUBJECT_PATTERN.test(title)) {
      errors.push('Subject must follow Conventional Commits format')
    }

    if (title.length > context.maxTitleLength) {
      errors.push(
        `Subject exceeds ${context.maxTitleLength} characters`
      )
    }

    if (this.containsFilePathOrExtension(title)) {
      errors.push('Subject must not include file paths or extensions')
    }

    const bannedSubjectPattern = new RegExp(
      `\\b(${BANNED_SUBJECT_WORDS.join('|')})\\b`,
      'i'
    )
    if (bannedSubjectPattern.test(title)) {
      errors.push('Subject contains banned filler words')
    }
    if (VAGUE_SUBJECT_PATTERNS.some((pattern) => pattern.test(title))) {
      errors.push('Subject is too vague')
    }

    if (context.internalChange && /^feat(\(|:)/.test(title)) {
      errors.push('Use refactor/chore for internal tooling changes (not feat)')
    }

    if (context.docsOnly && !/^docs(\(|:)/.test(title)) {
      errors.push('Use docs for documentation-only changes')
    }

    if (message.body) {
      if (
        context.includeBodyMode === 'never' ||
        !context.includeBodyAllowed
      ) {
        errors.push('Body is not allowed for this commit')
      }

      const bodyLines = message.body
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      if (bodyLines.length > 2) {
        errors.push('Body must be 2 bullets or fewer')
      }

      if (bodyLines.some((line) => !line.startsWith('- '))) {
        errors.push('Body bullets must start with "- "')
      }

      const narrationWords = [
        'update',
        'updated',
        'modify',
        'modified',
        'change',
        'changed',
        'refactor',
        'refactored',
        'adjust',
        'adjusted',
        'cleanup',
        'cleaned',
      ]
      const narrationPattern = new RegExp(
        `\\b(${narrationWords.join('|')})\\b`,
        'i'
      )
      if (bodyLines.some((line) => narrationPattern.test(line))) {
        errors.push('Body notes must avoid narration words')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Checks if a subject line is valid.
   *
   * @param subject - The subject line to validate
   * @param maxLength - Maximum allowed length
   * @returns True if valid, false otherwise
   */
  isValidSubject(subject: string, maxLength: number): boolean {
    if (!subject || subject.length > maxLength) return false
    if (!SUBJECT_PATTERN.test(subject)) return false
    if (this.containsFilePathOrExtension(subject)) return false
    const bannedSubjectPattern = new RegExp(
      `\\b(${BANNED_SUBJECT_WORDS.join('|')})\\b`,
      'i'
    )
    if (bannedSubjectPattern.test(subject)) return false
    if (VAGUE_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject))) {
      return false
    }
    return true
  }

  /**
   * Splits validation errors into structural and style categories.
   *
   * @param errors - Array of error messages
   * @returns Object with structural and style error arrays
   */
  splitValidationErrors(errors: string[]): {
    structural: string[]
    style: string[]
  } {
    const structural: string[] = []
    const style: string[] = []

    errors.forEach((error) => {
      if (
        error.includes('Conventional Commits format') ||
        error.includes('Use refactor/chore') ||
        error.includes('Use docs for documentation-only changes')
      ) {
        structural.push(error)
      } else {
        style.push(error)
      }
    })

    return { structural, style }
  }

  /**
   * Checks if text contains file paths or extensions.
   *
   * @param text - Text to check
   * @returns True if file paths or extensions found
   */
  private containsFilePathOrExtension(text: string): boolean {
    const hasPath =
      /[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+/.test(text) ||
      /[A-Za-z0-9._-]+\\[A-Za-z0-9._\\-]+/.test(text)
    const hasExtension = /\b[\w-]+\.[a-z][a-z0-9]{1,4}\b/i.test(text)
    return hasPath || hasExtension
  }
}
