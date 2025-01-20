import chalk from 'chalk'
import { Config, LogLevel } from '../types'

const LOG_ICONS = {
  DEBUG: '🔍',
  INFO: 'ℹ️ ',
  WARN: '⚠️ ',
  ERROR: '❌',
} as const

const LOG_COLORS = {
  DEBUG: chalk.cyan,
  INFO: chalk.green,
  WARN: chalk.yellow,
  ERROR: chalk.red,
} as const

export class Logger {
  private config: Config['debug']

  constructor(config: Config['debug']) {
    this.config = config
  }

  debug(message: string): void {
    this.log('DEBUG', message)
  }

  info(message: string): void {
    this.log('INFO', message)
  }

  warn(message: string): void {
    this.log('WARN', message)
  }

  error(message: string): void {
    this.log('ERROR', message)
  }

  private log(level: LogLevel, message: string): void {
    const LOG_LEVELS = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
    }

    // Only show messages at or above the current log level
    if (
      !this.config.enabled &&
      level !== 'ERROR' &&
      LOG_LEVELS[level] < LOG_LEVELS[this.config.logLevel]
    ) {
      return
    }

    const icon = LOG_ICONS[level]
    const colorize = LOG_COLORS[level]
    console.error(colorize(`${icon} ${message}`))
  }
}
