import fs from 'fs'
import path from 'path'
import os from 'os'
import { Config, ConfigOverrides, ConfigSchema } from '../types'
import LoggerService from './Logger.service'

/**
 * Service for managing configuration persistence
 */
class ConfigService {
  private static CONFIG_DIR = path.join(os.homedir(), '.config', 'aico')
  private static CONFIG_FILE = path.join(
    ConfigService.CONFIG_DIR,
    'config.json'
  )
  private static DEFAULT_CONFIG: Config = {
    openai: {
      apiKey: process.env.OPENAI_KEY || '',
      model: 'gpt-4o-mini',
      maxTokens: 200,
      temperature: 0.3,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
    },
    commit: {
      maxTitleLength: 72,
      maxBodyLength: 200,
      wrapBody: 72,
      includeBody: 'auto',
      includeFooter: false,
    },
    debug: {
      enabled: false,
      logLevel: 'INFO',
    },
  }

  /**
   * Ensures the config directory exists
   */
  private static ensureConfigDir(): void {
    if (!fs.existsSync(ConfigService.CONFIG_DIR)) {
      fs.mkdirSync(ConfigService.CONFIG_DIR, { recursive: true })
    }
  }

  private static isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  private static deepMerge<T>(...objects: Partial<T>[]): T {
    const result: Record<string, unknown> = {}

    for (const obj of objects) {
      if (!obj) continue
      for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) {
          continue
        }

        if (
          ConfigService.isPlainObject(value) &&
          ConfigService.isPlainObject(result[key])
        ) {
          result[key] = ConfigService.deepMerge(
            result[key] as Record<string, unknown>,
            value as Record<string, unknown>
          )
          continue
        }

        result[key] = value
      }
    }

    return result as T
  }

  private static migrateConfig(config: ConfigOverrides): ConfigOverrides {
    const includeBody = config.commit?.includeBody
    if (typeof includeBody === 'boolean') {
      return {
        ...config,
        commit: {
          ...config.commit,
          includeBody: includeBody ? 'always' : 'never',
        },
      }
    }

    return config
  }

  /**
   * Loads the user configuration if it exists
   */
  public static loadConfig(): ConfigOverrides {
    try {
      if (fs.existsSync(ConfigService.CONFIG_FILE)) {
        const configStr = fs.readFileSync(ConfigService.CONFIG_FILE, 'utf8')
        const config = JSON.parse(configStr)
        return ConfigService.migrateConfig(config)
      }
    } catch (error) {
      LoggerService.warn('Failed to load config file, using defaults')
      LoggerService.debug(String(error))
    }
    return {}
  }

  /**
   * Loads, migrates, deep-merges, and validates configuration.
   */
  public static getConfig(overrides: ConfigOverrides = {}): Config {
    const savedConfig = ConfigService.loadConfig()
    const merged = ConfigService.deepMerge<Config>(
      ConfigService.DEFAULT_CONFIG,
      savedConfig as Partial<Config>,
      overrides as Partial<Config>
    )

    return ConfigSchema.parse(merged)
  }

  /**
   * Saves the configuration to disk
   */
  public static saveConfig(config: ConfigOverrides): void {
    try {
      ConfigService.ensureConfigDir()
      const existingConfig = ConfigService.loadConfig()
      const newConfig = ConfigService.deepMerge(
        existingConfig as Partial<Config>,
        config as Partial<Config>
      )
      fs.writeFileSync(
        ConfigService.CONFIG_FILE,
        JSON.stringify(newConfig, null, 2)
      )
      LoggerService.debug('Configuration saved successfully')
    } catch (error) {
      LoggerService.warn('Failed to save config file')
      LoggerService.debug(String(error))
    }
  }

  /**
   * Updates the default model in the configuration
   */
  public static setDefaultModel(model: string): void {
    if (!['gpt-4o', 'gpt-4o-mini'].includes(model)) {
      throw new Error('Invalid model. Must be either gpt-4o or gpt-4o-mini')
    }

    const existingConfig = ConfigService.loadConfig()
    const config: ConfigOverrides = {
      openai: {
        ...existingConfig.openai,
        model,
      } as Config['openai'],
    }

    ConfigService.saveConfig(config)
    LoggerService.info(`Default model set to ${model}`)
  }

  /**
   * Sets the OpenAI API key in the configuration
   */
  public static setApiKey(apiKey: string): void {
    if (!apiKey.trim()) {
      throw new Error('API key cannot be empty')
    }

    const existingConfig = ConfigService.loadConfig()
    const config: ConfigOverrides = {
      openai: {
        ...existingConfig.openai,
        apiKey,
      } as Config['openai'],
    }

    ConfigService.saveConfig(config)
    LoggerService.info('OpenAI API key saved successfully')
  }
}

export default ConfigService
