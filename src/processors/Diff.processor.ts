import {
  ProcessedDiff,
  GitDiff,
  NameStatusEntry,
  NumStatEntry,
} from '../types'
import { NOISY_FILE_PATTERNS } from '../constants/patterns'

/**
 * Processor for analyzing and filtering git diffs.
 * Extracts structured signals (name-status, numstat, snippets) for commit generation.
 * Handles diff filtering, chunking, and context optimization.
 */

interface PatchSnippetOptions {
  topFiles?: string[]
  maxHunksPerFile?: number
  maxLinesPerHunk?: number
  maxCharsTotal?: number
}

interface ProcessDiffSignals {
  nameStatus?: NameStatusEntry[]
  numStat?: NumStatEntry[]
  topFiles?: string[]
  patchSnippets?: string[]
}

/**
 * A processor for filtering diffs and extracting small, high-signal snippets.
 */
class DiffProcessor {
  public isNoisyFile(filePath: string): boolean {
    return NOISY_FILE_PATTERNS.some((pattern) => pattern.test(filePath))
  }

  public isBinaryOrMediaFile(filePath: string): boolean {
    const binaryExtensions = [
      'mp4',
      'mov',
      'avi',
      'mkv',
      'wmv',
      'png',
      'jpg',
      'jpeg',
      'gif',
      'bmp',
      'ico',
      'svg',
      'webp',
      'mp3',
      'wav',
      'ogg',
      'm4a',
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'zip',
      'rar',
      'tar',
      'gz',
      '7z',
      'exe',
      'dll',
      'so',
      'dylib',
      'bin',
      'ttf',
      'otf',
      'woff',
      'woff2',
    ]
    const ext = filePath.split('.').pop()?.toLowerCase()
    return ext ? binaryExtensions.includes(ext) : false
  }

  /**
   * Filters out noisy files from the raw diff.
   */
  public filterNoisyFiles(rawPatch: string): string {
    const diffSections = rawPatch.split(/(?=diff --git )/g)
    return diffSections
      .filter((section) => {
        const match = section.match(/^diff --git a\/(.*) b\//)
        return match ? !this.isNoisyFile(match[1]) : true
      })
      .join('')
  }

  private splitPatchByFile(
    rawPatch: string
  ): { path: string; content: string }[] {
    const sections = rawPatch.split(/(?=diff --git )/g).filter(Boolean)
    return sections
      .map((section) => {
        const match = section.match(/^diff --git a\/(.*) b\/(.*)/)
        const path = match?.[2] || match?.[1] || ''
        return { path, content: section.trimEnd() }
      })
      .filter((section) => section.path)
  }

  public extractPatchSnippets(
    rawPatch: string,
    options: PatchSnippetOptions = {}
  ): string[] {
    const maxHunksPerFile = options.maxHunksPerFile ?? 2
    const maxLinesPerHunk = options.maxLinesPerHunk ?? 30
    const maxCharsTotal = options.maxCharsTotal ?? 12000
    const topFiles = options.topFiles
      ? new Set(options.topFiles)
      : undefined

    const filteredPatch = this.filterNoisyFiles(rawPatch)
    const sections = this.splitPatchByFile(filteredPatch)

    const snippets: string[] = []
    let totalChars = 0

    for (const section of sections) {
      if (topFiles && !topFiles.has(section.path)) {
        continue
      }

      if (this.isNoisyFile(section.path) || this.isBinaryOrMediaFile(section.path)) {
        continue
      }

      if (
        section.content.includes('GIT binary patch') ||
        section.content.includes('Binary files')
      ) {
        continue
      }

      const lines = section.content.split('\n')
      const headerLines: string[] = []
      let index = 0

      while (index < lines.length && !lines[index].startsWith('@@')) {
        headerLines.push(lines[index])
        index += 1
      }

      const hunks: string[][] = []
      let currentHunk: string[] = []

      for (; index < lines.length; index += 1) {
        const line = lines[index]
        if (line.startsWith('@@')) {
          if (currentHunk.length > 0) {
            hunks.push(currentHunk)
          }
          currentHunk = [line]
        } else if (currentHunk.length > 0) {
          currentHunk.push(line)
        }
      }
      if (currentHunk.length > 0) {
        hunks.push(currentHunk)
      }

      const scoredHunks = hunks
        .map((hunk) => {
          const changeCount = hunk.filter(
            (line) =>
              (line.startsWith('+') && !line.startsWith('+++')) ||
              (line.startsWith('-') && !line.startsWith('---'))
          ).length
          return { hunk, changeCount }
        })
        .sort((a, b) => b.changeCount - a.changeCount)
        .slice(0, maxHunksPerFile)

      if (scoredHunks.length === 0) {
        continue
      }

      const snippetLines: string[] = [`File: ${section.path}`]
      snippetLines.push(...headerLines.slice(0, 6))

      for (const { hunk } of scoredHunks) {
        const trimmedHunk = hunk.slice(0, maxLinesPerHunk + 1)
        snippetLines.push(...trimmedHunk)
      }

      const snippet = snippetLines.join('\n').trimEnd()

      if (totalChars + snippet.length > maxCharsTotal) {
        break
      }

      snippets.push(snippet)
      totalChars += snippet.length
    }

    return snippets
  }

  public buildStructuredSummary(signals?: ProcessDiffSignals): string {
    const parts: string[] = []
    const nameStatus = signals?.nameStatus || []
    const numStat = signals?.numStat || []
    const topFiles = signals?.topFiles || []

    if (nameStatus.length > 0) {
      parts.push('Files:')
      for (const entry of nameStatus) {
        if (entry.status === 'R' || entry.status === 'C') {
          const oldPath = entry.oldPath || 'unknown'
          parts.push(`- ${entry.status} ${oldPath} -> ${entry.path}`)
        } else {
          parts.push(`- ${entry.status} ${entry.path}`)
        }
      }
    }

    const topList = topFiles.length > 0
      ? topFiles
      : numStat
          .slice()
          .sort(
            (a, b) => b.insertions + b.deletions - (a.insertions + a.deletions)
          )
          .slice(0, 5)
          .map((entry) => entry.path)

    if (topList.length > 0) {
      if (parts.length > 0) {
        parts.push('')
      }
      parts.push('Top changes:')
      for (const path of topList) {
        const stats = numStat.find((entry) => entry.path === path)
        if (stats) {
          parts.push(
            `- ${path} (+${stats.insertions}/-${stats.deletions})`
          )
        } else {
          parts.push(`- ${path}`)
        }
      }
    }

    return parts.join('\n').trim()
  }

  private buildFallbackSignals(rawPatch: string): ProcessDiffSignals {
    const fileMatches = Array.from(
      rawPatch.matchAll(/^diff --git a\/(.*) b\/(.*)$/gm)
    )
    const nameStatus = fileMatches.map((match) => ({
      status: 'M' as const,
      path: match[2] || match[1],
    }))

    return { nameStatus }
  }

  private countLineChanges(rawPatch: string): { additions: number; deletions: number } {
    let additions = 0
    let deletions = 0

    rawPatch.split('\n').forEach((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) additions += 1
      if (line.startsWith('-') && !line.startsWith('---')) deletions += 1
    })

    return { additions, deletions }
  }

  public processDiffWithSignals(
    diff: string,
    signals: ProcessDiffSignals = {},
    isMerge: boolean = false
  ): ProcessedDiff {
    const filteredRawDiff = this.filterNoisyFiles(diff)
    const fallbackSignals = this.buildFallbackSignals(filteredRawDiff)
    const mergedSignals: ProcessDiffSignals = {
      ...fallbackSignals,
      ...signals,
    }

    const summary = this.buildStructuredSummary(mergedSignals)

    const statsFromNumstat = mergedSignals.numStat
      ? mergedSignals.numStat.reduce(
          (acc, entry) => {
            acc.additions += entry.insertions
            acc.deletions += entry.deletions
            return acc
          },
          { additions: 0, deletions: 0 }
        )
      : this.countLineChanges(filteredRawDiff)

    const filesChanged = mergedSignals.nameStatus
      ? mergedSignals.nameStatus.filter(
          (entry) =>
            !this.isNoisyFile(entry.path) && !this.isBinaryOrMediaFile(entry.path)
        ).length
      : fallbackSignals.nameStatus?.length || 0

    const details: GitDiff = {
      fileOperations: [],
      functionChanges: [],
      dependencyChanges: [],
      additions: [],
      deletions: [],
      rawDiff: diff,
      filteredRawDiff,
    }

    return {
      summary: summary || 'Files: (none)',
      details,
      stats: {
        originalLength: diff.length,
        processedLength: summary.length,
        filesChanged,
        additions: statsFromNumstat.additions,
        deletions: statsFromNumstat.deletions,
        wasSummarized: true,
      },
      signals: {
        nameStatus: mergedSignals.nameStatus || [],
        numStat: mergedSignals.numStat || [],
        topFiles: mergedSignals.topFiles || [],
        patchSnippets: mergedSignals.patchSnippets || [],
      },
      isMerge,
    }
  }

  public processDiff(
    diff: string,
    isMerge: boolean = false
  ): ProcessedDiff {
    return this.processDiffWithSignals(diff, {}, isMerge)
  }
}

export default new DiffProcessor()
