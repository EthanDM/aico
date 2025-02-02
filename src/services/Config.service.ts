import fs from 'fs'
import path from 'path'
import os from 'os'
import { Config, ConfigSchema } from '../types'
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

  /**
   * Ensures the config directory exists
   */
  private static ensureConfigDir(): void {
    if (!fs.existsSync(ConfigService.CONFIG_DIR)) {
      fs.mkdirSync(ConfigService.CONFIG_DIR, { recursive: true })
    }
  }

  /**
   * Loads the user configuration if it exists
   */
  public static loadConfig(): Partial<Config> {
    try {
      if (fs.existsSync(ConfigService.CONFIG_FILE)) {
        const configStr = fs.readFileSync(ConfigService.CONFIG_FILE, 'utf8')
        const config = JSON.parse(configStr)
        return config
      }
    } catch (error) {
      LoggerService.warn('Failed to load config file, using defaults')
      LoggerService.debug(String(error))
    }
    return {}
  }

  /**
   * Saves the configuration to disk
   */
  public static saveConfig(config: Partial<Config>): void {
    try {
      ConfigService.ensureConfigDir()
      const existingConfig = ConfigService.loadConfig()
      const newConfig = { ...existingConfig, ...config }
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
    const config: Partial<Config> = {
      openai: {
        ...existingConfig.openai,
        model,
      } as Config['openai'],
    }

    ConfigService.saveConfig(config)
    LoggerService.info(`Default model set to ${model}`)
  }
}

export default ConfigService
