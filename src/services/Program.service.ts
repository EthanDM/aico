import { Command } from 'commander'
import { Config, ConfigSchema } from '../types/index'
import LoggerService from './Logger.service'
import AppLogService from './AppLog.service'
import ConfigService from './Config.service'
import chalk from 'chalk'
import figlet from 'figlet'

export interface ProgramOptions {
  debug?: boolean
  mini?: boolean
  /**
   * Whether to prompt for user context before generating commit message
   */
  context?: boolean | string
  /**
   * Whether to automatically stage changes (defaults to true)
   */
  autoStage?: boolean
  /**
   * Whether this is a merge commit
   */
  merge?: boolean
  full?: boolean
  setDefaultModel?: string
  setApiKey?: string
  /**
   * Whether to generate a branch name instead of a commit message
   */
  branch?: boolean
}

/**
 * Default configuration for the program.
 */
const defaultConfig: Config = {
  openai: {
    apiKey: process.env.OPENAI_KEY || '',
    model: 'gpt-4o-mini',
    maxTokens: 200,
    temperature: 0.3,
    topP: 0.9,
    frequencyPenalty: 0.1,
    presencePenalty: 0,
  },
  commit: {
    maxTitleLength: 50,
    maxBodyLength: 200,
    wrapBody: 72,
    includeBody: true,
    includeFooter: false,
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
      .option(
        '-f, --full',
        chalk.yellow('use full GPT-4o model for this commit')
      )
      .option(
        '-c, --context [context]',
        chalk.yellow(
          'provide context for AI guidance (interactive if no value given)'
        )
      )
      .option(
        '--no-auto-stage',
        chalk.yellow('disable automatic staging of changes')
      )
      .option('--merge', chalk.yellow('treat this as a merge commit'))
      .option(
        '--set-default-model <model>',
        chalk.yellow('set the default model (gpt-4o or gpt-4o-mini)')
      )
      .option('--set-api-key <key>', chalk.yellow('set your OpenAI API key'))
      .option(
        '-b, --branch',
        chalk.yellow('generate a branch name instead of a commit message')
      )
      .allowUnknownOption()
      .parse(process.argv)

    const options = this.program.opts<ProgramOptions>()
    const positionalArgs = this.program.args

    // Handle positional arguments as context (if no context flag provided)
    if (positionalArgs.length > 0 && !options.context) {
      options.context = positionalArgs.join(' ')
    }

    // Handle setting API key if requested
    if (options.setApiKey) {
      ConfigService.setApiKey(options.setApiKey)
      process.exit(0)
    }

    // Handle setting default model if requested
    if (options.setDefaultModel) {
      ConfigService.setDefaultModel(options.setDefaultModel)
      process.exit(0)
    }

    // Load saved config and check for API key
    const savedConfig = ConfigService.loadConfig()
    const apiKey = process.env.OPENAI_KEY || savedConfig.openai?.apiKey

    // Validate API key
    if (!apiKey) {
      LoggerService.error('OpenAI API key not found!')
      LoggerService.info('\nYou can set your API key in one of two ways:')
      LoggerService.info('1. Run: aico --set-api-key YOUR_API_KEY')
      LoggerService.info('2. Set the OPENAI_KEY environment variable')
      throw new Error('OpenAI API key is required')
    }

    // Initialize configuration
    try {
      const config = ConfigSchema.parse({
        ...defaultConfig,
        ...savedConfig,
        openai: {
          ...defaultConfig.openai,
          ...savedConfig.openai,
          apiKey, // Use environment variable or saved key
          // Override with full model if requested
          model: options.full
            ? 'gpt-4o'
            : savedConfig.openai?.model || defaultConfig.openai.model,
        },
        debug: {
          ...defaultConfig.debug,
          enabled: options.debug,
          logLevel: options.debug ? 'DEBUG' : defaultConfig.debug.logLevel,
        },
      })

      // Configure logger
      LoggerService.setConfig(config.debug)
      AppLogService.debugModeEnabled(options, config)

      // Pass options to services that need them
      const serviceOptions = {
        context: options.context || false,
        noAutoStage: options.autoStage === false,
        merge: options.merge || false,
        branch: options.branch || false,
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
