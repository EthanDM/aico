#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import { simpleGit } from 'simple-git'
import { createDiffProcessor } from './git/diffProcessor'
import { createOpenAIService } from './services/openai'
import { Config, ConfigSchema, CommitMessage } from './types'
import { createLogger } from './utils/logger'

const git = simpleGit()

// Default configuration
const defaultConfig: Config = {
  openai: {
    apiKey: process.env.OPENAI_KEY || '',
    model: 'gpt-4o-mini',
    maxTokens: 300,
    temperature: 0.5,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },
  commit: {
    maxTitleLength: 72,
    maxBodyLength: 500,
    wrapBody: 72,
    includeBody: true,
    includeFooter: true,
  },
  debug: {
    enabled: false,
    logLevel: 'INFO',
  },
}

const program = new Command()
  .name('ai-commit')
  .description('AI-powered git commit message generator')
  .version('1.0.0')
  .option('-d, --debug', 'enable debug mode')
  .option('-p, --gpt4', 'use GPT-4o for enhanced responses')
  .option('-h, --help', 'display help')

const doCommit = async (message: string | CommitMessage): Promise<void> => {
  const { title, body } =
    typeof message === 'string' ? { title: message, body: undefined } : message

  const fullMessage = [
    title,
    '', // Empty line after title
    body,
  ]
    .filter(Boolean)
    .join('\n')

  await git.commit(fullMessage)
}

const editMessage = async (message: string): Promise<string> => {
  const editor = process.env.EDITOR || 'vim'
  const tempFile = '/tmp/commit-message.txt'
  const fs = await import('fs/promises')
  const { spawn } = await import('child_process')

  await fs.writeFile(tempFile, message)

  return new Promise((resolve, reject) => {
    const child = spawn(editor, [tempFile], { stdio: 'inherit' })
    child.on('exit', async () => {
      try {
        const editedMessage = await fs.readFile(tempFile, 'utf8')
        await fs.unlink(tempFile)
        resolve(editedMessage.trim())
      } catch (error) {
        reject(error)
      }
    })
  })
}

const viewDiff = async (): Promise<void> => {
  const pager = process.env.GIT_PAGER || process.env.PAGER || 'less'
  const { spawn } = await import('child_process')

  return new Promise((resolve) => {
    const diff = spawn('git', ['diff', '--staged'], {
      stdio: ['inherit', 'pipe', 'inherit'],
    })
    const less = spawn(pager, [], { stdio: ['pipe', 'inherit', 'inherit'] })

    diff.stdout.pipe(less.stdin)
    less.on('exit', resolve)
  })
}

const handleAction = async (
  action: string,
  message: CommitMessage,
  logger: ReturnType<typeof createLogger>
): Promise<void> => {
  switch (action) {
    case 'accept':
      logger.info('✨ Committing changes...')
      await doCommit(message)
      logger.info('✅ Changes committed successfully!')
      break
    case 'edit':
      logger.info('✏️  Opening editor...')
      const editedMessage = await editMessage(
        [message.title, '', message.body].filter(Boolean).join('\n')
      )

      if (editedMessage) {
        logger.info('✨ Committing changes...')
        await doCommit(editedMessage)
        logger.info('✅ Changes committed successfully!')
      } else {
        logger.error('❌ Commit cancelled - empty message')
      }
      break
    case 'regenerate':
      logger.info('🔄 Regenerating message...')
      await main()
      break
    case 'diff':
      logger.info('📄 Showing full diff...')
      await viewDiff()
      await main()
      break
    case 'cancel':
      logger.info('❌ Commit cancelled')
      process.exit(0)
  }
}

const main = async (): Promise<void> => {
  program.parse()
  const options = program.opts()

  try {
    // Validate environment
    if (!process.env.OPENAI_KEY) {
      throw new Error('OPENAI_KEY environment variable is not set')
    }

    // Initialize configuration
    const config = ConfigSchema.parse({
      ...defaultConfig,
      debug: {
        ...defaultConfig.debug,
        enabled: options.debug,
      },
      openai: {
        ...defaultConfig.openai,
        model: options.gpt4 ? 'gpt-4o' : 'gpt-4o-mini',
      },
    })

    const logger = createLogger(config.debug)
    const diffProcessor = createDiffProcessor()
    const openai = createOpenAIService(config.openai, config.debug)

    // Process git changes
    logger.info('🔍 Analyzing changes...')
    const diff = await diffProcessor.getStagedChanges()

    if (diff.stats.filesChanged === 0) {
      logger.error('❌ No changes to commit')
      process.exit(1)
    }

    // Generate commit message
    logger.info('💭 Generating commit message...')
    const message = await openai.generateCommitMessage(diff)

    // Display results
    console.log('\n📝 Changes to be committed:')
    if (diff.stats.wasSummarized) {
      console.log(chalk.blue('(Summarized due to size)'))
    }
    console.log(chalk.blue(diff.summary))

    console.log('\n💡 Proposed commit message:')
    console.log(chalk.green(message.title))
    if (message.body) {
      console.log('\n' + message.body)
    }

    // Interactive prompt
    const { default: inquirer } = await import('inquirer')
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Accept and commit', value: 'accept' },
          { name: 'Edit message', value: 'edit' },
          { name: 'Regenerate message', value: 'regenerate' },
          { name: 'View full diff', value: 'diff' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ])

    await handleAction(action, message, logger)
  } catch (error) {
    console.error(
      chalk.red('Error:'),
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error)
  process.exit(1)
})
