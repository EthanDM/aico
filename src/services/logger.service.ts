import chalk from 'chalk'
import { Config, LogLevel } from '../types'

interface LoggerService {
  debug: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
  setConfig: (config: Config['debug']) => void
}

/**
 * Creates a logger service instance.
 *
 * @returns An instance of LoggerService
 */
const createLoggerService = (): LoggerService => {
  let config: Config['debug'] = {
    enabled: false,
    logLevel: 'INFO',
  }

  const LOG_LEVELS: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= LOG_LEVELS[config.logLevel]
  }

  const debug = (message: string): void => {
    if (config.enabled && shouldLog('DEBUG')) {
      console.log(chalk.gray(message))
    }
  }

  const info = (message: string): void => {
    if (shouldLog('INFO')) {
      console.log(message)
    }
  }

  const warn = (message: string): void => {
    if (shouldLog('WARN')) {
      console.log(chalk.yellow(message))
    }
  }

  const error = (message: string): void => {
    if (shouldLog('ERROR')) {
      console.error(chalk.red(message))
    }
  }

  const setConfig = (newConfig: Config['debug']): void => {
    config = newConfig
  }

  return {
    debug,
    info,
    warn,
    error,
    setConfig,
  }
}

// Export a single instance
export const loggerService = createLoggerService()
