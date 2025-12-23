import { z } from 'zod'

/**
 * Config schema for the application.
 */
export const ConfigSchema = z.object({
  openai: z.object({
    apiKey: z.string(),
    model: z.string().default('gpt-4o-mini'),
    maxTokens: z.number().default(200),
    temperature: z.number().default(0.3),
    topP: z.number().default(0.9),
    frequencyPenalty: z.number().default(0),
    presencePenalty: z.number().default(0),
  }),
  commit: z.object({
    maxTitleLength: z.number().default(72),
    maxBodyLength: z.number().default(200),
    wrapBody: z.number().default(72),
    includeBody: z.enum(['auto', 'never', 'always']).default('auto'),
    includeFooter: z.boolean().default(false),
    scopeRules: z
      .array(
        z.object({
          scope: z.string(),
          match: z.string(),
        })
      )
      .default([]),
    enableBehaviorTemplates: z.boolean().default(false),
  }),
  debug: z.object({
    enabled: z.boolean().default(false),
    logLevel: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
  }),
})

/**
 * Type for the Config schema.
 */
export type Config = z.infer<typeof ConfigSchema>

export type ConfigOverrides = {
  openai?: Partial<Config['openai']>
  commit?: Partial<Config['commit']>
  debug?: Partial<Config['debug']>
}

export type NameStatusCode = 'A' | 'M' | 'D' | 'R' | 'C'

export interface NameStatusEntry {
  status: NameStatusCode
  path: string
  oldPath?: string
}

export interface NumStatEntry {
  insertions: number
  deletions: number
  path: string
  oldPath?: string
}

/**
 * Interface for the GitDiff type.
 */
export interface GitDiff {
  fileOperations: string[]
  functionChanges: string[]
  dependencyChanges: string[]
  additions: string[]
  deletions: string[]
  rawDiff: string
  filteredRawDiff: string
  changePatterns?: string[]
}

/**
 * Interface for the ProcessedDiff type.
 */
export interface ProcessedDiff {
  summary: string
  details: GitDiff
  stats: {
    originalLength: number
    processedLength: number
    filesChanged: number
    additions: number
    deletions: number
    wasSummarized: boolean
    qualityIndicator?: string
  }
  signals?: {
    nameStatus: NameStatusEntry[]
    numStat: NumStatEntry[]
    topFiles: string[]
    patchSnippets: string[]
  }
  isMerge?: boolean
}

/**
 * Interface for the CommitMessage type.
 */
export interface CommitMessage {
  title: string
  body?: string
}

/**
 * Type for the LogLevel enum.
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

/**
 * Interface for the OpenAIService type.
 */
export interface OpenAIService {
  generateCommitMessage: (
    diff: ProcessedDiff,
    userMessage?: string
  ) => Promise<CommitMessage>
}
