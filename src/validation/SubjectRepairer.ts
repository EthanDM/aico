import { Config, ProcessedDiff } from '../types'
import { CommitValidator } from './CommitValidator'
import { CommitHeuristics } from '../heuristics/CommitHeuristics'
import { ScopeInferrer } from '../heuristics/ScopeInferrer'

/**
 * Service for repairing and improving generated commit subjects.
 * Applies fallback templates, fixes violations, and deterministically repairs invalid subjects.
 * Used as a local-first repair strategy before retrying the model.
 */

type CommitConfig = Config['commit']

const SUBJECT_PARSE_PATTERN =
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?: (.+)$/

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

const TRAILING_STOP_WORDS = [
  'and',
  'or',
  'with',
  'for',
  'to',
  'in',
  'on',
  'at',
  'from',
  'into',
  'by',
]

const TASTE_VERB_REWRITES: Array<[RegExp, string]> = [
  [/\badjust\b/gi, 'refine'],
  [/\btweak\b/gi, 'refine'],
  [/\bimprove\b/gi, 'tighten'],
]

const TASTE_PHRASE_REWRITES: Array<[RegExp, string]> = [
  [/\badjust\s+(.+?)\s+behavior\b/gi, 'refine $1'],
  [/\badjust\s+(.+?)\s+parameters\b/gi, 'refine $1'],
  [/\badd\s+(.+?)\s+logic\b/gi, 'add $1'],
  [/\badd\s+(.+?)\s+handling\b/gi, 'support $1'],
  [/\bupdate\s+(.+?)\s+handling\b/gi, 'refine $1'],
]

const PREFERRED_VERBS = [
  'refine',
  'tighten',
  'harden',
  'clarify',
  'standardize',
  'rename',
  'remove',
  'support',
  'detect',
  'prevent',
]

const DISCOURAGED_VERBS = [
  'implement',
  'adjust',
  'handle',
  'process',
  'manage',
]

/**
 * Service for repairing and rewriting commit subjects.
 * Handles subject normalization, repair, truncation, and fallback generation.
 */
export class SubjectRepairer {
  constructor(
    private config: CommitConfig,
    private heuristics: CommitHeuristics,
    private scopeInferrer: ScopeInferrer,
    private validator: CommitValidator
  ) { }

  /**
   * Normalizes a subject by taking first line and cleaning whitespace.
   *
   * @param candidate - The candidate subject
   * @returns Normalized subject
   */
  normalizeSubject(candidate: string): string {
    return candidate.split('\n')[0]?.replace(/\s+/g, ' ').trim() || ''
  }

  /**
   * Attempts to repair a subject line.
   *
   * @param diff - The processed diff
   * @param candidate - The candidate subject to repair
   * @returns Repaired subject or undefined if repair failed
   */
  repair(
    diff: ProcessedDiff,
    candidate: string
  ): string | undefined {
    const maxLength = this.config.maxTitleLength
    const normalized = this.normalizeSubject(candidate)
    const match = normalized.match(SUBJECT_PARSE_PATTERN)
    if (!match) {
      return undefined
    }

    const type = match[1]
    const scope = match[2] || ''
    let description = match[3]

    description = this.stripFilePaths(description)
    description = this.removeBannedWords(description)
    description = this.normalizeRenameDescription(description)
    description = description.replace(/\s+/g, ' ').trim()
    description = description
      .replace(/\b(from|in|on|at|within|inside)\s*$/i, '')
      .trim()

    if (
      !description ||
      VAGUE_SUBJECT_PATTERNS.some((pattern) =>
        pattern.test(`${type}${scope}: ${description}`)
      ) ||
      this.heuristics.isVagueDescription(description)
    ) {
      const template = this.buildBehaviorTemplateSubject(diff)
      if (template) {
        return template
      }
      if (this.heuristics.isDocsTouched(diff) && !this.heuristics.isDocsOnlyChange(diff)) {
        description = 'refine docs change detection for commit subjects'
      } else {
        description = 'align commit flow'
      }
    }

    description = this.refineDescriptionWording(description, {
      docsTouched: this.heuristics.isDocsTouched(diff),
      internalChange: this.heuristics.isInternalToolingChange(diff),
      qualityTuning: this.heuristics.isQualityTuningChange(diff),
    })

    const prefix = `${type}${scope}: `
    const renameDescription = this.buildRenameDescription(
      description,
      maxLength,
      prefix.length
    )
    const subject = this.truncateSubjectToMax(
      `${type}${scope}: ${renameDescription}`,
      maxLength
    )

    if (!this.validator.isValidSubject(subject, maxLength)) {
      return undefined
    }

    return subject
  }

  /**
   * Attempts to repair a docs-only subject.
   *
   * @param diff - The processed diff
   * @param candidate - The candidate subject to repair
   * @returns Repaired docs subject or undefined if not docs-only
   */
  repairDocs(
    diff: ProcessedDiff,
    candidate: string
  ): string | undefined {
    if (!this.heuristics.isDocsOnlyChange(diff)) {
      return undefined
    }

    const normalized = this.normalizeSubject(candidate)
    const match = normalized.match(SUBJECT_PARSE_PATTERN)
    const description = match ? match[3] : 'update documentation'
    const scope = this.heuristics.getDocsScope(diff)
    const subject = this.truncateSubjectToMax(
      `docs(${scope}): ${description}`,
      this.config.maxTitleLength
    )

    if (!this.validator.isValidSubject(subject, this.config.maxTitleLength)) {
      return undefined
    }

    return subject
  }

  /**
   * Builds a safe fallback subject when all else fails.
   *
   * @param diff - The processed diff
   * @param candidate - Optional candidate subject
   * @returns A valid fallback subject
   */
  buildFallback(
    diff: ProcessedDiff,
    candidate?: string
  ): string {
    const maxLength = this.config.maxTitleLength
    const candidateSubject = candidate
      ? this.normalizeSubject(candidate)
      : ''

    if (this.validator.isValidSubject(candidateSubject, maxLength)) {
      return candidateSubject
    }

    const truncatedCandidate = this.truncateSubjectToMax(
      candidateSubject,
      maxLength
    )
    if (this.validator.isValidSubject(truncatedCandidate, maxLength)) {
      return truncatedCandidate
    }

    const scopeHint = this.scopeInferrer.infer(
      diff.signals?.topFiles?.length
        ? diff.signals.topFiles
        : diff.signals?.nameStatus?.map((entry) => entry.path) || []
    )

    const baseDescription = 'align commit flow'
    const preferredType = scopeHint ? 'refactor' : 'chore'
    const scoped = scopeHint
      ? `${preferredType}(${scopeHint}): ${baseDescription}`
      : `${preferredType}: ${baseDescription}`

    const scopedTruncated = this.truncateSubjectToMax(scoped, maxLength)
    if (this.validator.isValidSubject(scopedTruncated, maxLength)) {
      return scopedTruncated
    }

    const fallback = `chore: ${baseDescription}`
    const fallbackTruncated = this.truncateSubjectToMax(fallback, maxLength)
    if (this.validator.isValidSubject(fallbackTruncated, maxLength)) {
      return fallbackTruncated
    }

    return 'chore: align commit flow'
  }

  /**
   * Truncates a subject to maximum length while preserving structure.
   *
   * @param subject - The subject to truncate
   * @param maxLength - Maximum allowed length
   * @returns Truncated subject
   */
  truncateSubjectToMax(subject: string, maxLength: number): string {
    if (subject.length <= maxLength) return subject
    const match = subject.match(SUBJECT_PARSE_PATTERN)
    if (!match) {
      return subject.slice(0, maxLength).trim()
    }

    const type = match[1]
    const scope = match[2] || ''
    const description = match[3]
    const prefix = `${type}${scope}: `
    const allowed = Math.max(0, maxLength - prefix.length)

    if (allowed === 0) {
      return `${type}: align commit flow`.slice(0, maxLength).trim()
    }

    const rawSlice = description.slice(0, allowed)
    const lastSpaceIndex = rawSlice.lastIndexOf(' ')
    let candidate =
      lastSpaceIndex > 0
        ? rawSlice.slice(0, lastSpaceIndex).trim()
        : rawSlice.trim()
    candidate = candidate.replace(/[-:,.]+$/, '').trim()
    candidate = this.trimTrailingStopWord(candidate)
    const cleaned = candidate.replace(/[-:,.]+$/, '').trim()
    if (!cleaned) {
      return `${type}${scope}: align commit flow`.slice(0, maxLength).trim()
    }
    return `${prefix}${cleaned}`.trim()
  }

  /**
   * Strips file paths and extensions from text.
   *
   * @param text - Text to clean
   * @returns Cleaned text
   */
  private stripFilePaths(text: string): string {
    let cleaned = text
    cleaned = cleaned.replace(/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+/g, '')
    cleaned = cleaned.replace(/[A-Za-z0-9._-]+\\[A-Za-z0-9._\\-]+/g, '')
    cleaned = cleaned.replace(/\b[\w-]+\.[a-z][a-z0-9]{1,4}\b/gi, '')
    return cleaned
  }

  /**
   * Removes banned words from text.
   *
   * @param text - Text to clean
   * @returns Cleaned text
   */
  private removeBannedWords(text: string): string {
    const bannedSubjectPattern = new RegExp(
      `\\b(${BANNED_SUBJECT_WORDS.join('|')})\\b`,
      'gi'
    )
    return text.replace(bannedSubjectPattern, '')
  }

  /**
   * Normalizes rename descriptions to standard format.
   *
   * @param description - Description to normalize
   * @returns Normalized description
   */
  private normalizeRenameDescription(description: string): string {
    const normalized = description.replace(/\s+/g, ' ').trim()
    // Examples: "replace A with B" -> "rename A to B", "A -> B" -> "rename A to B".
    const replaceMatch = normalized.match(
      /^replace\s+(.+?)\s+with\s+(.+)$/i
    )
    if (replaceMatch) {
      return `rename ${replaceMatch[1]} to ${replaceMatch[2]}`
    }

    const renameMatch = normalized.match(/^rename\s+(.+?)\s+to\s+(.+)$/i)
    if (renameMatch) {
      return `rename ${renameMatch[1]} to ${renameMatch[2]}`
    }

    const arrowMatch = normalized.match(/^(.+?)\s*(?:->|→)\s*(.+)$/)
    if (arrowMatch) {
      return `rename ${arrowMatch[1]} to ${arrowMatch[2]}`
    }

    return description
  }

  /**
   * Shortens a rename pair by stripping common prefixes.
   *
   * @param source - Source name
   * @param target - Target name
   * @returns Shortened pair
   */
  private shortenRenamePair(source: string, target: string): {
    source: string
    target: string
  } {
    const stripPrefix = (value: string) =>
      value.replace(/^enable/i, '').replace(/^\W+/, '').trim() || value
    return {
      source: stripPrefix(source),
      target: stripPrefix(target),
    }
  }

  /**
   * Builds a rename description that fits within length constraints.
   *
   * @param description - Description to build
   * @param maxLength - Maximum total length
   * @param prefixLength - Length of type/scope prefix
   * @returns Formatted rename description
   */
  private buildRenameDescription(
    description: string,
    maxLength: number,
    prefixLength: number
  ): string {
    const match = description.match(/^rename\s+(.+?)\s+to\s+(.+)$/i)
    if (!match) {
      return description
    }

    const rawSource = this.stripFilePaths(match[1]).trim()
    const rawTarget = this.stripFilePaths(match[2]).trim()
    if (!rawSource || !rawTarget) {
      return description
    }

    const fullDescription = `rename ${rawSource} to ${rawTarget}`
    if (prefixLength + fullDescription.length <= maxLength) {
      return fullDescription
    }

    const arrowDescription = `rename ${rawSource} → ${rawTarget}`
    if (prefixLength + arrowDescription.length <= maxLength) {
      return arrowDescription
    }

    const shortened = this.shortenRenamePair(rawSource, rawTarget)
    const shortenedDescription = `rename ${shortened.source} → ${shortened.target}`
    if (prefixLength + shortenedDescription.length <= maxLength) {
      return shortenedDescription
    }

    return `rename ${rawSource} → ${rawTarget}`
  }

  /**
   * Refines description wording based on context.
   *
   * @param description - Description to refine
   * @param context - Context for refinement decisions
   * @returns Refined description
   */
  private refineDescriptionWording(
    description: string,
    context: {
      docsTouched?: boolean
      internalChange?: boolean
      qualityTuning?: boolean
    }
  ): string {
    let refined = description

    for (const [pattern, replacement] of TASTE_PHRASE_REWRITES) {
      refined = refined.replace(pattern, replacement)
    }

    refined = this.normalizeVerbChoice(refined, context)
    refined = this.tightenNouns(refined)

    for (const [pattern, replacement] of TASTE_VERB_REWRITES) {
      refined = refined.replace(pattern, replacement)
    }

    refined = refined.replace(/\bhandling\b/gi, 'support')
    refined = refined.replace(/\bprocess\b/gi, '')
    refined = refined.replace(/\bparameters?\b/gi, '')
    refined = refined.replace(/\s+/g, ' ').trim()

    if (context.docsTouched) {
      refined = refined.replace(/\bdocumentation changes?\b/gi, 'docs changes')
      refined = refined.replace(/\bdocs changes?\b/gi, 'docs change detection')
    }

    if (context.internalChange) {
      refined = refined.replace(/\blogic\b/gi, 'validation')
    }

    return this.finalizeDescription(refined)
  }

  /**
   * Normalizes verb choice based on context.
   *
   * @param description - Description to normalize
   * @param context - Context for normalization
   * @returns Normalized description
   */
  private normalizeVerbChoice(
    description: string,
    context: { docsTouched?: boolean; internalChange?: boolean; qualityTuning?: boolean }
  ): string {
    let refined = description
    if (context.qualityTuning || context.internalChange) {
      refined = refined.replace(/\bimplement\b/gi, 'refine')
      refined = refined.replace(/\badd\b/gi, 'refine')
    }
    refined = refined.replace(/\badjust\b/gi, 'refine')
    refined = refined.replace(/\bimprove\b/gi, 'tighten')
    return refined
  }

  /**
   * Tightens noun phrases in description.
   *
   * @param description - Description to tighten
   * @returns Tightened description
   */
  private tightenNouns(description: string): string {
    let refined = description
    refined = refined.replace(/\bdescription refinement\b/gi, 'description wording')
    refined = refined.replace(/\bcommit messages\b/gi, 'commit subjects')
    refined = refined.replace(/\bdocumentation changes?\b/gi, 'docs change detection')
    refined = refined.replace(/\bvalidation process\b/gi, 'validation')
    refined = refined.replace(/\bconfiguration handling\b/gi, 'config handling')
    refined = refined.replace(/\bbehavior\b/gi, '')
    return refined
  }

  /**
   * Finalizes description by cleaning up formatting.
   *
   * @param description - Description to finalize
   * @returns Finalized description
   */
  private finalizeDescription(description: string): string {
    let refined = description.replace(/\s+/g, ' ').trim()
    refined = refined.replace(/[-:,.]+$/, '').trim()
    refined = this.trimTrailingStopWord(refined)
    return refined.replace(/\s+/g, ' ').trim()
  }

  /**
   * Trims trailing stop words from text.
   *
   * @param text - Text to trim
   * @returns Trimmed text
   */
  private trimTrailingStopWord(text: string): string {
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0) return text
    while (words.length > 1) {
      const lastWord = words[words.length - 1].toLowerCase()
      if (!TRAILING_STOP_WORDS.includes(lastWord)) {
        break
      }
      words.pop()
    }
    return words.join(' ')
  }

  /**
   * Builds a behavior template subject for specific patterns.
   *
   * @param diff - The processed diff
   * @returns Template subject or undefined
   */
  private buildBehaviorTemplateSubject(diff: ProcessedDiff): string | undefined {
    if (!this.config.enableBehaviorTemplates) {
      return undefined
    }
    const paths = diff.signals?.topFiles?.length
      ? diff.signals.topFiles
      : diff.signals?.nameStatus?.map((entry) => entry.path) || []
    const snippets = diff.signals?.patchSnippets?.join('\n') || ''

    const translationsOnly =
      paths.length > 0 &&
      paths.every((path) => /^src\/translations\//.test(path))
    if (translationsOnly) {
      return 'feat(translations): add new copy strings'
    }

    const loggingSwap =
      /console\./.test(snippets) && /AppLogger|LoggerService/.test(snippets)
    if (loggingSwap && paths.length > 0 && paths.length <= 3) {
      return 'chore(logging): standardize logging'
    }

    return undefined
  }
}
