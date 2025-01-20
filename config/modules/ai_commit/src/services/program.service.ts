import { Command } from 'commander'
import { Config, ConfigSchema } from '../types'
import { createLogger } from '../utils/logger'

interface ProgramOptions {
  debug?: boolean
  gpt4?: boolean
}

interface ProgramService {
  initialize: () => Promise<{
    config: Config
    logger: ReturnType<typeof createLogger>
  }>
}

/**
 * Default configuration for the program.
 */
const defaultConfig: Config = {
  openai: {
    apiKey: process.env.OPENAI_KEY || '',
    model: 'gpt-4o-mini',
    maxTokens: 300,
    temperature: 0.5,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  commit: {
    maxTitleLength: 72,
    maxBodyLength: 500,
    wrapBody: 72,
    includeBody: true,
    includeFooter: true,
  },
  debug: {
    enabled: false,
    logLevel: 'INFO',
  },
}

/**
 * Creates a program service to handle CLI setup and configuration.
 *
 * @returns An instance of the ProgramService.
 */
export const createProgramService = (): ProgramService => {
  const program = new Command()
    .name('ai-commit')
    .description('AI-powered git commit message generator')
    .version('1.0.0')
    .option('-d, --debug', 'enable debug mode')
    .option('-p, --gpt4', 'use GPT-4o for enhanced responses')
    .option('-h, --help', 'display help')

  /**
   * Initializes the program, parses options, and creates configuration.
   *
   * @returns The program configuration and logger.
   * @throws Error if OPENAI_KEY is not set.
   */
  const initialize = async (): Promise<{
    config: Config
    logger: ReturnType<typeof createLogger>
  }> => {
    program.parse()
    const options = program.opts<ProgramOptions>()

    // Validate environment
    if (!process.env.OPENAI_KEY) {
      throw new Error('OPENAI_KEY environment variable is not set')
    }

    // Initialize configuration
    const config = ConfigSchema.parse({
      ...defaultConfig,
      debug: {
        ...defaultConfig.debug,
        enabled: options.debug,
      },
      openai: {
        ...defaultConfig.openai,
        model: options.gpt4 ? 'gpt-4o' : 'gpt-4o-mini',
      },
    })

    const logger = createLogger(config.debug)
    return { config, logger }
  }

  return {
    initialize,
  }
}

export const programService = createProgramService()
