import { Command } from 'commander'
import { Config, ConfigOverrides } from '../types/index'
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
  /**
   * Whether to generate a pull request title and description
   */
  pullRequest?: boolean
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
      .option(
        '-p, --pull-request',
        chalk.yellow('generate a pull request title and description')
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

    // Initialize configuration
    try {
      const overrides: ConfigOverrides = {
        openai: {
          ...(process.env.OPENAI_KEY
            ? { apiKey: process.env.OPENAI_KEY }
            : {}),
          ...(options.full ? { model: 'gpt-4o' } : {}),
        },
        debug: {
          enabled: options.debug || false,
          logLevel: options.debug ? 'DEBUG' : 'INFO',
        },
      }

      const config = ConfigService.getConfig(overrides)

      // Validate API key
      if (!config.openai.apiKey) {
        LoggerService.error('OpenAI API key not found!')
        LoggerService.info('\nYou can set your API key in one of two ways:')
        LoggerService.info('1. Run: aico --set-api-key YOUR_API_KEY')
        LoggerService.info('2. Set the OPENAI_KEY environment variable')
        throw new Error('OpenAI API key is required')
      }

      // Configure logger
      LoggerService.setConfig(config.debug)
      AppLogService.debugModeEnabled(options, config)

      // Pass options to services that need them
      if (options.branch && options.pullRequest) {
        throw new Error(
          'Options --branch and --pull-request cannot be used together'
        )
      }

      const serviceOptions = {
        context: options.context || false,
        noAutoStage: options.autoStage === false,
        merge: options.merge || false,
        branch: options.branch || false,
        pullRequest: options.pullRequest || false,
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
