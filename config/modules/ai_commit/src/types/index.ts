import { z } from 'zod'

export const ConfigSchema = z.object({
  openai: z.object({
    apiKey: z.string(),
    model: z.string().default('gpt-4o-mini'),
    maxTokens: z.number().default(300),
    temperature: z.number().default(0.5),
    topP: z.number().default(1),
    frequencyPenalty: z.number().default(0),
    presencePenalty: z.number().default(0),
  }),
  commit: z.object({
    maxTitleLength: z.number().default(72),
    maxBodyLength: z.number().default(500),
    wrapBody: z.number().default(72),
    includeBody: z.boolean().default(true),
    includeFooter: z.boolean().default(true),
  }),
  debug: z.object({
    enabled: z.boolean().default(false),
    logLevel: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
  }),
})

export type Config = z.infer<typeof ConfigSchema>

export interface GitDiff {
  fileOperations: string[]
  functionChanges: string[]
  dependencyChanges: string[]
  additions: string[]
  deletions: string[]
  rawDiff: string
}

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
  }
}

export interface CommitMessage {
  title: string
  body?: string
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface OpenAIService {
  generateCommitMessage: (
    diff: ProcessedDiff,
    userMessage?: string
  ) => Promise<CommitMessage>
}
