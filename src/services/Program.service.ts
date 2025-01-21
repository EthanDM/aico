import { Command } from 'commander'
import { Config, ConfigSchema } from '../types/index'
import { loggerService } from './Logger.service'

interface ProgramOptions {
  debug?: boolean
  gpt4?: boolean
  message?: string
}

interface ProgramService {
  initialize: () => Promise<{
    config: Config
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
 * Service for handling CLI program setup and configuration.
 */
class ProgramServiceImpl implements ProgramService {
  private program: Command

  constructor() {
    this.program = new Command()
  }

  /**
   * Initializes the program, parses options, and creates configuration.
   *
   * @returns The program configuration and options.
   * @throws Error if OPENAI_KEY is not set.
   */
  public async initialize(): Promise<{
    config: Config
    options: ProgramOptions
  }> {
    // Parse command line arguments
    this.program
      .name('aico')
      .description('AI-powered git commit message generator')
      .version('1.0.0')
      .option('-d, --debug', 'enable debug mode')
      .option('-4, --gpt4', 'use GPT-4 model')
      .option('-m, --message <message>', 'Provide a message to guide the AI')

    this.program.parse(process.argv)
    const options = this.program.opts<ProgramOptions>()

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
          logLevel: options.debug ? 'DEBUG' : defaultConfig.debug.logLevel,
        },
        openai: {
          ...defaultConfig.openai,
          model: options.gpt4 ? 'gpt-4' : defaultConfig.openai.model,
        },
      })

      // Configure logger
      loggerService.setConfig(config.debug)

      // Log initial debug information
      loggerService.debug('🔧 Debug mode enabled')
      loggerService.debug('Options: ' + JSON.stringify(options, null, 2))
      loggerService.debug('Config: ' + JSON.stringify(config, null, 2))

      return { config, options }
    } catch (error) {
      loggerService.error('Failed to parse config: ' + String(error))
      throw error
    }
  }
}

// Export a single instance
export const programService = new ProgramServiceImpl()
