#!/usr/bin/env node
import chalk from 'chalk'
import { createOpenAIService } from './services/openai.service'
import { gitService } from './services/git.service'
import { uiService } from './services/ui.service'
import { programService } from './services/program.service'

/**
 * Main function to run the CLI.
 *
 * @returns A promise that resolves when the CLI is finished.
 */
const main = async (): Promise<void> => {
  try {
    const { config, logger } = await programService.initialize()
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

/**
 * Entry point for the CLI.
 */
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error)
  process.exit(1)
})
