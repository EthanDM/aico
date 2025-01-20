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

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const

interface Logger {
  debug: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

const shouldLog = (level: LogLevel, config: Config['debug']): boolean =>
  config.enabled ||
  level === 'ERROR' ||
  LOG_LEVELS[level] >= LOG_LEVELS[config.logLevel]

const formatMessage = (level: LogLevel, message: string): string => {
  const icon = LOG_ICONS[level]
  const colorize = LOG_COLORS[level]
  return colorize(`${icon} ${message}`)
}

export const createLogger = (config: Config['debug']): Logger => {
  const log = (level: LogLevel, message: string): void => {
    if (shouldLog(level, config)) {
      console.error(formatMessage(level, message))
    }
  }

  return {
    debug: (message: string) => log('DEBUG', message),
    info: (message: string) => log('INFO', message),
    warn: (message: string) => log('WARN', message),
    error: (message: string) => log('ERROR', message),
  }
}
