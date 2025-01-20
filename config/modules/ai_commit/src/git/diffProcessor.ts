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

export class DiffProcessor {
  private git = simpleGit()

  async getStagedChanges(): Promise<ProcessedDiff> {
    const status = await this.git.status()
    const diff = await this.git.diff(['--staged'])
    return this.processDiff(diff, status.staged)
  }

  async getAllChanges(): Promise<ProcessedDiff> {
    const status = await this.git.status()
    const diff = await this.git.diff()
    return this.processDiff(diff, status.modified)
  }

  private async processDiff(
    rawDiff: string,
    changedFiles: string[]
  ): Promise<ProcessedDiff> {
    const filteredFiles = this.filterNoisyFiles(changedFiles)
    const details = await this.extractDiffDetails(rawDiff, filteredFiles)

    const stats = {
      originalLength: rawDiff.length,
      processedLength: details.rawDiff.length,
      filesChanged: changedFiles.length,
      additions: this.countLines(details.additions),
      deletions: this.countLines(details.deletions),
    }

    const summary = this.generateSummary(details, stats)

    return { summary, details, stats }
  }

  private filterNoisyFiles(files: string[]): string[] {
    return files.filter(
      (file) => !NOISY_FILE_PATTERNS.some((pattern) => pattern.test(file))
    )
  }

  private async extractDiffDetails(
    rawDiff: string,
    files: string[]
  ): Promise<GitDiff> {
    const lines = rawDiff.split('\n')

    return {
      fileOperations: this.extractMatches(
        lines,
        /^diff --git|^new file|^deleted file|^rename/
      ),
      functionChanges: this.extractMatches(
        lines,
        /^\+.*\b(function|class|def|interface|enum|struct|module)\b/
      ),
      dependencyChanges: this.extractMatches(
        lines,
        /^\+.*("dependencies"|"devDependencies"|import |require |use |from )/
      ),
      additions: this.extractMatches(lines, /^\+[^+\s]/, /^\+\s*(\/\/|\*|#|$)/),
      deletions: this.extractMatches(lines, /^\-[^-\s]/, /^\-\s*(\/\/|\*|#|$)/),
      rawDiff: files.length > 0 ? rawDiff : '',
    }
  }

  private extractMatches(
    lines: string[],
    pattern: RegExp,
    excludePattern?: RegExp
  ): string[] {
    return lines
      .filter((line) => pattern.test(line))
      .filter((line) => !excludePattern || !excludePattern.test(line))
      .map((line) => line.trim())
      .slice(0, 20) // Limit number of matches
  }

  private countLines(lines: string[]): number {
    return lines.length
  }

  private generateSummary(
    diff: GitDiff,
    stats: ProcessedDiff['stats']
  ): string {
    const sections: string[] = []

    if (diff.fileOperations.length > 0) {
      sections.push(
        '=== File Operations ===\n' + diff.fileOperations.join('\n')
      )
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
      sections.push(
        '=== Significant Additions ===\n' + diff.additions.join('\n')
      )
    }

    if (diff.deletions.length > 0) {
      sections.push(
        '=== Significant Deletions ===\n' + diff.deletions.join('\n')
      )
    }

    return sections.join('\n\n')
  }
}
