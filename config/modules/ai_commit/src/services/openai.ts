import OpenAI from 'openai'
import { Config, ProcessedDiff, CommitMessage } from '../types'

type OpenAIConfig = Config['openai']

interface OpenAIService {
  generateCommitMessage: (diff: ProcessedDiff) => Promise<CommitMessage>
}

const buildPrompt = (diff: ProcessedDiff): string => {
  const parts = [
    'Generate a commit message for the following changes:\n',
    diff.summary,
  ]

  if (diff.stats.filesChanged > 0) {
    parts.push(`\nFiles changed: ${diff.stats.filesChanged}`)
    parts.push(`Additions: ${diff.stats.additions}`)
    parts.push(`Deletions: ${diff.stats.deletions}`)
  }

  return parts.join('\n')
}

const parseCommitMessage = (content: string): CommitMessage => {
  const lines = content.trim().split('\n')
  const title = lines[0].trim()

  let body: string | undefined
  let footer: string | undefined

  // Find the body (everything between title and footer)
  const bodyLines: string[] = []
  let footerStartIndex = -1

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('BREAKING CHANGE:') || /^[A-Z-]+: /.test(line)) {
      footerStartIndex = i
      break
    }
    if (line) {
      bodyLines.push(line)
    }
  }

  if (bodyLines.length > 0) {
    body = bodyLines.join('\n')
  }

  // Get the footer if it exists
  if (footerStartIndex !== -1) {
    footer = lines.slice(footerStartIndex).join('\n')
  }

  return { title, body, footer }
}

export const createOpenAIService = (config: OpenAIConfig): OpenAIService => {
  const client = new OpenAI({ apiKey: config.apiKey })

  const generateCommitMessage = async (
    diff: ProcessedDiff
  ): Promise<CommitMessage> => {
    const prompt = buildPrompt(diff)

    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that generates clear and concise git commit messages.
            Follow the conventional commits format: <type>(<scope>): <description>
            Types: feat|fix|docs|style|refactor|test|chore
            Keep the first line under 72 characters.
            Use bullet points for the body if needed.
            DO NOT INCLUDE ANYTHING ELSE IN THE RESPONSE OR WRAP IN ANYTHING ELSE.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      top_p: config.topP,
      frequency_penalty: config.frequencyPenalty,
      presence_penalty: config.presencePenalty,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No commit message generated')
    }

    return parseCommitMessage(content)
  }

  return {
    generateCommitMessage,
  }
}
