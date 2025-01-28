import { Command } from 'commander'
import { Config, ConfigSchema } from '../types/index'
import LoggerService from './Logger.service'
import AppLogService from './AppLog.service'
import chalk from 'chalk'
import figlet from 'figlet'

export interface ProgramOptions {
  debug?: boolean
  mini?: boolean
  /**
   * Skip user prompts for context and staging, automatically stage all changes
   */
  skip?: boolean
}

/**
 * Default configuration for the program.
 */
const defaultConfig: Config = {
  openai: {
    apiKey: process.env.OPENAI_KEY || '',
    model: 'gpt-4o',
    maxTokens: 500,
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
class ProgramService {
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
    // Add the fun banner
    console.log(
      chalk.blue(
        figlet.textSync('AICO', {
          horizontalLayout: 'default',
          verticalLayout: 'default',
        })
      )
    )
    const tagline = [
      'Supercharge your commits 🚀',
      'Effortless commits, powered by AI 🤖',
      'Write less, commit more 🎉',
    ][Math.floor(Math.random() * 3)]

    console.log(chalk.cyanBright(tagline))

    console.log(chalk.gray('Your AI-powered git commit assistant\n'))

    // Parse command line arguments
    this.program
      .name('aico')
      .description(chalk.green('AI-powered git commit message generator'))
      .version('1.0.0')
      .option('-d, --debug', chalk.yellow('enable debug mode'))
      .option('-m, --mini', chalk.yellow('use lighter GPT-4o-mini model'))
      .option('-s, --skip', chalk.yellow('skip prompts and auto-stage changes'))
      .parse(process.argv)

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
          // Use mini model if requested, otherwise stick with GPT-4o
          model: options.mini ? 'gpt-4o-mini' : defaultConfig.openai.model,
        },
      })

      // Configure logger
      LoggerService.setConfig(config.debug)
      AppLogService.debugModeEnabled(options, config)

      // Pass skip option to services that need it
      const serviceOptions = {
        skip: options.skip || false,
      }

      return { config, options: serviceOptions }
    } catch (error) {
      AppLogService.configurationError(error)
      throw error
    }
  }
}

// Export a single instance
export const programService = new ProgramService()
