import chalk from 'chalk'
import { CommitMessage, Config, ProcessedDiff } from '../types'
import LoggerService from './Logger.service'
import { ProgramOptions } from './Program.service'

/**
 * Service for handling application logging with different log levels and formatting.
 */
class AppLogService {
  public debugModeEnabled(options: ProgramOptions, config: Config): void {
    LoggerService.debug('🔧 Debug mode enabled')
    LoggerService.debug('Options: ' + JSON.stringify(options, null, 2))
    LoggerService.debug('Config: ' + JSON.stringify(config, null, 2))
  }

  public configurationError(error: unknown): void {
    LoggerService.error(String(error))
  }

  public debugGitDiff(diff: ProcessedDiff): void {
    LoggerService.debug('\n📊 Git Stats:')
    LoggerService.debug(`Files changed: ${diff.stats.filesChanged}`)
    LoggerService.debug(`Additions: ${diff.stats.additions}`)
    LoggerService.debug(`Deletions: ${diff.stats.deletions}`)
    if (diff.stats.wasSummarized) {
      LoggerService.debug('(Diff was summarized due to size)')
      LoggerService.debug(`Original length: ${diff.stats.originalLength}`)
      LoggerService.debug(`Processed length: ${diff.stats.processedLength}`)
    }

    LoggerService.debug('\n📝 Changes:')
    if (diff.details.fileOperations.length > 0) {
      LoggerService.debug('\nFile Operations:')
      diff.details.fileOperations.forEach((op) =>
        LoggerService.debug(`  ${op}`)
      )
    }
    if (diff.details.functionChanges.length > 0) {
      LoggerService.debug('\nFunction Changes:')
      diff.details.functionChanges.forEach((change) =>
        LoggerService.debug(`  ${change}`)
      )
    }
    if (diff.details.dependencyChanges.length > 0) {
      LoggerService.debug('\nDependency Changes:')
      diff.details.dependencyChanges.forEach((dep) =>
        LoggerService.debug(`  ${dep}`)
      )
    }

    LoggerService.debug('\n📄 Raw Diff:')
    LoggerService.debug(diff.details.rawDiff)

    LoggerService.debug('\n📝 Summary:')
    LoggerService.debug(diff.summary)
  }

  public gitStats(diff: ProcessedDiff): void {
    LoggerService.info('\n📊 Git Stats:')
    LoggerService.info(`Files changed: ${diff.stats.filesChanged}`)
    LoggerService.info(`Additions: ${diff.stats.additions}`)
    LoggerService.info(`Deletions: ${diff.stats.deletions}`)
    LoggerService.info(`Original length: ${diff.stats.originalLength}`)
    LoggerService.info(`Processed length: ${diff.stats.processedLength}`)
  }

  public generatingCommitMessage(): void {
    LoggerService.info('\n💭 Generating commit message...')
  }

  public commitMessageGenerated(message: CommitMessage): void {
    // LoggerService.info('\n💡 Proposed commit message:')
    // LoggerService.info(message.title)
    // if (message.body) {
    //   LoggerService.info(message.body)
    // }

    console.log('\n💡 Proposed commit message:')
    console.log(chalk.green(message.title))
    if (message.body) {
      console.log('\n' + message.body)
    }
  }
}

export default new AppLogService()
