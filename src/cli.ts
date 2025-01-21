#!/usr/bin/env node
import { programService } from './services/Program.service'
import { createWorkflow } from './services/Workflow.service'
import { loggerService } from './services/Logger.service'

/**
 * Main function to run the CLI.
 *
 * @returns A promise that resolves when the CLI is finished.
 */
const main = async (): Promise<void> => {
  try {
    const { config, options } = await programService.initialize()
    const workflow = createWorkflow(config)

    const message = await workflow.generateCommitMessage(options.message)
    const result = await workflow.promptForAction(message)

    if (result === 'restart') {
      await main() // Restart the flow
    } else if (result === 'exit') {
      process.exit(0)
    }
  } catch (error) {
    loggerService.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

/**
 * Entry point for the CLI.
 */
main().catch((error) => {
  loggerService.error('Fatal error: ' + String(error))
  process.exit(1)
})
