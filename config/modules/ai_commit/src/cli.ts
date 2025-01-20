#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { createOpenAIService } from './services/openai.service'
import { Config, ConfigSchema } from './types'
import { createLogger } from './utils/logger'
import { gitService } from './services/git.service'
import { uiService } from './services/ui.service'

// Default configuration
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

const program = new Command()
  .name('ai-commit')
  .description('AI-powered git commit message generator')
  .version('1.0.0')
  .option('-d, --debug', 'enable debug mode')
  .option('-p, --gpt4', 'use GPT-4o for enhanced responses')
  .option('-h, --help', 'display help')

const main = async (): Promise<void> => {
  program.parse()
  const options = program.opts()

  try {
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
    const openai = createOpenAIService(config.openai, config.debug)

    // Process git changes
    logger.info('🔍 Analyzing changes...')
    const diff = await gitService.getStagedChanges()

    if (diff.stats.filesChanged === 0) {
      logger.error('❌ No changes to commit')
      process.exit(1)
    }

    // Generate commit message
    logger.info('💭 Generating commit message...')
    const message = await openai.generateCommitMessage(diff)

    // Display results
    console.log('\n📝 Changes to be committed:')
    if (diff.stats.wasSummarized) {
      console.log(chalk.blue('(Summarized due to size)'))
    }
    console.log(chalk.blue(diff.summary))

    console.log('\n💡 Proposed commit message:')
    console.log(chalk.green(message.title))
    if (message.body) {
      console.log('\n' + message.body)
    }

    // Interactive prompt
    const { default: inquirer } = await import('inquirer')
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Accept and commit', value: 'accept' },
          { name: 'Edit message', value: 'edit' },
          { name: 'Regenerate message', value: 'regenerate' },
          { name: 'View full diff', value: 'diff' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ])

    const result = await uiService.handleAction(action, message, logger)

    if (result === 'restart') {
      await main() // Restart the flow
    } else if (result === 'exit') {
      process.exit(0)
    }
  } catch (error) {
    console.error(
      chalk.red('Error:'),
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error)
  process.exit(1)
})
