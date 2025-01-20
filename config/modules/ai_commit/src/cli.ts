#!/usr/bin/env node
import chalk from 'chalk'
import { programService } from './services/program.service'
import { createWorkflow } from './services/workflow.service'

/**
 * Main function to run the CLI.
 *
 * @returns A promise that resolves when the CLI is finished.
 */
const main = async (): Promise<void> => {
  try {
    const { config, logger, options } = await programService.initialize()
    const workflow = createWorkflow(config, logger)

    const message = await workflow.generateCommitMessage(options.message)
    const result = await workflow.promptForAction(message)

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
