#!/usr/bin/env node
import { programService } from './services/Program.service'
import { createWorkflow } from './services/Workflow.service'
import LoggerService from './services/Logger.service'

/**
 * Main function to run the CLI.
 *
 * @returns A promise that resolves when the CLI is finished.
 */
const main = async (): Promise<void> => {
  try {
    const { config, options } = await programService.initialize()
    const workflow = createWorkflow(config, options)

    if (options.pullRequest) {
      await workflow.generatePullRequestMessage()
    } else if (options.branch) {
      // Generate branch name
      await workflow.generateBranchName()
    } else {
      // Generate commit message
      const message = await workflow.generateCommitMessage()
      const result = await workflow.promptForAction(message)

      if (result === 'restart') {
        await main() // Restart the flow
      } else if (result === 'exit') {
        process.exit(0)
      }
    }
  } catch (error) {
    LoggerService.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

/**
 * Entry point for the CLI.
 */
main().catch((error) => {
  LoggerService.error('Fatal error: ' + String(error))
  process.exit(1)
})
