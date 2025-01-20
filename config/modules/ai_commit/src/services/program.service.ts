import { Command } from 'commander'
import { Config, ConfigSchema } from '../types/index'
import { createLogger } from '../utils/logger'

interface ProgramOptions {
  debug?: boolean
  gpt4?: boolean
  message?: string
}

interface ProgramService {
  initialize: () => Promise<{
    config: Config
    logger: ReturnType<typeof createLogger>
    options: ProgramOptions
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

  /**
   * Initializes the program, parses options, and creates configuration.
   *
   * @returns The program configuration and logger.
   * @throws Error if OPENAI_KEY is not set.
   */
  const initialize = async (): Promise<{
    config: Config
    logger: ReturnType<typeof createLogger>
    options: ProgramOptions
  }> => {
    // Parse command line arguments
    program
      .name('ai-commit')
      .description('AI-powered git commit message generator')
      .version('1.0.0')
      .option('-d, --debug', 'enable debug mode')
      .option('-4, --gpt4', 'use GPT-4 model')
      .option('-m, --message <message>', 'Provide a message to guide the AI')

    program.parse(process.argv)
    const options = program.opts<ProgramOptions>()

    console.log('Debug - Options:', options)
    console.log('Debug - Default Config:', defaultConfig)

    // Validate environment
    if (!process.env.OPENAI_KEY) {
      throw new Error('OPENAI_KEY environment variable is not set')
    }

    // Initialize configuration
    try {
      const config = ConfigSchema.parse({
        ...defaultConfig,
        debug: {
          ...defaultConfig.debug,
          enabled: options.debug,
        },
        openai: {
          ...defaultConfig.openai,
          model: options.gpt4 ? 'gpt-4' : defaultConfig.openai.model,
        },
      })
      console.log('Debug - Parsed Config:', config)
      const logger = createLogger(config.debug)
      return { config, logger, options }
    } catch (error) {
      console.error('Failed to parse config:', error)
      throw error
    }
  }

  return {
    initialize,
  }
}

export const programService = createProgramService()
