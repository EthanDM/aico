import { ProcessedDiff, NumStatEntry, NameStatusEntry } from '../types'
import DiffProcessor from '../processors/Diff.processor'
import GitService from './Git.service'

/**
 * Service for orchestrating diff processing.
 * Handles the retrieval and processing of staged changes using GitService and DiffProcessor.
 */
class DiffOrchestrator {
  /**
   * Gets the diff of all staged changes with processed diff information.
   *
   * @param isMerge - Whether this is a merge commit
   * @param modelType - The AI model being used (affects processing strategy)
   * @returns The processed diff of staged changes.
   */
  public async getStagedChanges(
    isMerge: boolean = false,
    modelType: string = 'gpt-4o'
  ): Promise<ProcessedDiff> {
    const rawPatch = await GitService.getStagedDiff()
    const nameStatus = await GitService.getStagedNameStatusRaw()
    const numStat = await GitService.getStagedNumStatRaw()

    const topFiles = this.getTopFiles(numStat, nameStatus)
    const patchForTopFiles =
      topFiles.length > 0
        ? await GitService.getStagedPatchForPaths(topFiles)
        : rawPatch
    const patchSnippets = DiffProcessor.extractPatchSnippets(patchForTopFiles, {
      topFiles,
      maxHunksPerFile: 2,
      maxLinesPerHunk: 30,
      maxCharsTotal: 12000,
    })

    return DiffProcessor.processDiffWithSignals(
      rawPatch,
      {
        nameStatus,
        numStat,
        topFiles,
        patchSnippets,
      },
      isMerge
    )
  }

  /**
   * Selects top files by churn from numstat and nameStatus entries.
   * Prioritizes high-churn files while filtering out noisy and binary files.
   *
   * @param numStat - Numstat entries with line change counts
   * @param nameStatus - Name-status entries with file operations
   * @returns Array of top file paths sorted by relevance
   */
  private getTopFiles(
    numStat: NumStatEntry[],
    nameStatus: NameStatusEntry[]
  ): string[] {
    const candidates = numStat
      .slice()
      .sort(
        (a, b) => b.insertions + b.deletions - (a.insertions + a.deletions)
      )
      .map((entry) => entry.path)

    const unique = new Set<string>()
    for (const path of candidates) {
      if (DiffProcessor.isNoisyFile(path)) continue
      if (DiffProcessor.isBinaryOrMediaFile(path)) continue
      unique.add(path)
      if (unique.size >= 5) break
    }

    if (unique.size === 0) {
      for (const entry of nameStatus) {
        if (DiffProcessor.isNoisyFile(entry.path)) continue
        if (DiffProcessor.isBinaryOrMediaFile(entry.path)) continue
        unique.add(entry.path)
        if (unique.size >= 3) break
      }
    }

    return Array.from(unique)
  }
}

export default new DiffOrchestrator()
