import { simpleGit } from 'simple-git'
import { GitDiff, ProcessedDiff } from '../types'

const NOISY_FILE_PATTERNS = [
  // Package managers and dependencies
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^.*\.lock$/,
  // Build outputs
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^node_modules\//,
  // Generated files
  /\.min\.(js|css)$/,
  /\.bundle\.js$/,
  /\.generated\./,
  // Environment and config
  /^\.env/,
  /\.DS_Store$/,
  // Logs and debug
  /^logs\//,
  /\.log$/,
]

interface DiffProcessor {
  getStagedChanges: () => Promise<ProcessedDiff>
  getAllChanges: () => Promise<ProcessedDiff>
}

const filterNoisyFiles = (files: string[]): string[] =>
  files.filter(
    (file) => !NOISY_FILE_PATTERNS.some((pattern) => pattern.test(file))
  )

const extractMatches = (
  lines: string[],
  pattern: RegExp,
  excludePattern?: RegExp
): string[] =>
  lines
    .filter((line) => pattern.test(line))
    .filter((line) => !excludePattern || !excludePattern.test(line))
    .map((line) => line.trim())
    .slice(0, 20) // Limit number of matches

const extractDiffDetails = (rawDiff: string, files: string[]): GitDiff => {
  const lines = rawDiff.split('\n')

  return {
    fileOperations: extractMatches(
      lines,
      /^diff --git|^new file|^deleted file|^rename/
    ),
    functionChanges: extractMatches(
      lines,
      /^\+.*\b(function|class|def|interface|enum|struct|module)\b/
    ),
    dependencyChanges: extractMatches(
      lines,
      /^\+.*("dependencies"|"devDependencies"|import |require |use |from )/
    ),
    additions: extractMatches(lines, /^\+[^+\s]/, /^\+\s*(\/\/|\*|#|$)/),
    deletions: extractMatches(lines, /^\-[^-\s]/, /^\-\s*(\/\/|\*|#|$)/),
    rawDiff: files.length > 0 ? rawDiff : '',
  }
}

const generateSummary = (
  diff: GitDiff,
  stats: ProcessedDiff['stats']
): string => {
  const sections: string[] = []

  if (diff.fileOperations.length > 0) {
    sections.push('=== File Operations ===\n' + diff.fileOperations.join('\n'))
  }

  if (diff.functionChanges.length > 0) {
    sections.push(
      '=== Function Changes ===\n' + diff.functionChanges.join('\n')
    )
  }

  if (diff.dependencyChanges.length > 0) {
    sections.push(
      '=== Dependency Changes ===\n' + diff.dependencyChanges.join('\n')
    )
  }

  if (diff.additions.length > 0) {
    sections.push('=== Significant Additions ===\n' + diff.additions.join('\n'))
  }

  if (diff.deletions.length > 0) {
    sections.push('=== Significant Deletions ===\n' + diff.deletions.join('\n'))
  }

  return sections.join('\n\n')
}

const processDiff = async (
  rawDiff: string,
  changedFiles: string[]
): Promise<ProcessedDiff> => {
  const filteredFiles = filterNoisyFiles(changedFiles)
  const details = extractDiffDetails(rawDiff, filteredFiles)

  const stats = {
    originalLength: rawDiff.length,
    processedLength: details.rawDiff.length,
    filesChanged: changedFiles.length,
    additions: details.additions.length,
    deletions: details.deletions.length,
  }

  const summary = generateSummary(details, stats)

  return { summary, details, stats }
}

export const createDiffProcessor = (): DiffProcessor => {
  const git = simpleGit()

  const getStagedChanges = async (): Promise<ProcessedDiff> => {
    const status = await git.status()
    const diff = await git.diff(['--staged'])
    return processDiff(diff, status.staged)
  }

  const getAllChanges = async (): Promise<ProcessedDiff> => {
    const status = await git.status()
    const diff = await git.diff()
    return processDiff(diff, status.modified)
  }

  return {
    getStagedChanges,
    getAllChanges,
  }
}
