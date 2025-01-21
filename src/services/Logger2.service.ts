import chalk from 'chalk'
import { Config, LogLevel } from '../types'

/**
 * Service for handling application logging with different log levels and formatting.
 */
class LoggerService {
  private config: Config['debug'] = {
    enabled: false,
    logLevel: 'INFO',
  }

  private readonly LOG_LEVELS: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }

  /**
   * Determines if a message at the given level should be logged.
   *
   * @param level - The log level to check
   * @returns Whether the message should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.LOG_LEVELS[level] >= this.LOG_LEVELS[this.config.logLevel]
  }

  /**
   * Logs a debug message in gray.
   * Only shown if debug mode is enabled.
   *
   * @param message - The message to log
   */
  public debug(message: string): void {
    if (this.config.enabled && this.shouldLog('DEBUG')) {
      console.log(chalk.gray(message))
    }
  }

  /**
   * Logs an info message.
   *
   * @param message - The message to log
   */
  public info(message: string): void {
    if (this.shouldLog('INFO')) {
      console.log(message)
    }
  }

  /**
   * Logs a warning message in yellow.
   *
   * @param message - The message to log
   */
  public warn(message: string): void {
    if (this.shouldLog('WARN')) {
      console.log(chalk.yellow(message))
    }
  }

  /**
   * Logs an error message in red.
   *
   * @param message - The message to log
   */
  public error(message: string): void {
    if (this.shouldLog('ERROR')) {
      console.error(chalk.red(message))
    }
  }

  /**
   * Updates the logger configuration.
   *
   * @param newConfig - The new debug configuration
   */
  public setConfig(newConfig: Config['debug']): void {
    this.config = newConfig
  }
}

// Export a single instance
export const loggerService = new LoggerService()
