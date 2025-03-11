# aico

An AI-powered git commit message generator that creates conventional commit messages using OpenAI.

## Features

- 🤖 Generates semantic commit messages using AI
- 📝 Follows [Conventional Commits](https://www.conventionalcommits.org/) format
- 🔄 Interactive workflow with preview and edit options
- 🌳 Considers git branch context and recent commits
- 🎯 Supports user-provided message guidance

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- Git
- OpenAI API key

### Installation Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/EthanDM/aico.git
   cd aico
   ```

2. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

3. Make the CLI executable and create a global link:
   ```bash
   chmod +x dist/cli.js
   npm link
   ```

### Setting up your OpenAI API Key

AICO requires an OpenAI API key to function. You have two options to provide it:

1. **Recommended: Save it in your configuration** (one-time setup)

   ```bash
   aico --set-api-key YOUR_API_KEY
   ```

   This saves your API key securely in `~/.config/aico/config.json`

2. **Alternative: Use an environment variable**
   ```bash
   export OPENAI_KEY=YOUR_API_KEY
   ```
   You'll need to set this each time you open a new terminal, or add it to your shell's configuration file.

## Configuration

AICO can be configured in several ways:

### Command Line Options

```bash
Options:
  -d, --debug           Enable debug logging
  -f, --full            Use full GPT-4o model for this commit
  -c, --context         Prompt for user context before generating commit message
  --no-auto-stage       Disable automatic staging of changes
  --merge               Treat this as a merge commit
  --set-default-model   Set the default model (gpt-4o or gpt-4o-mini)
  --set-api-key         Set your OpenAI API key
  -b, --branch          Generate a branch name instead of a commit message
  -h, --help            Display help information
  -v, --version         Output the version number
```

### Configuration File

AICO looks for a configuration file at `~/.config/aico/config.json`. You can create this file manually or use the `--set-default-model` option to manage model settings.

See `config.example.json` in the repository for a complete example of available options.

#### Model Configuration

By default, AICO uses the GPT-4o-mini model for better performance and lower resource usage. You can:

- Use the full GPT-4o model for a single commit: `aico -f` or `aico --full`
- Set GPT-4o as your default: `aico --set-default-model gpt-4o`
- Set GPT-4o-mini as your default: `aico --set-default-model gpt-4o-mini`

The configuration file supports the following options:

```json
{
  "openai": {
    "model": "gpt-4o-mini", // Model to use (gpt-4o or gpt-4o-mini)
    "maxTokens": 500, // Maximum tokens in response
    "temperature": 0.5, // Response creativity (0-1)
    "topP": 1, // Response diversity
    "frequencyPenalty": 0.2, // Penalty for repetition
    "presencePenalty": 0 // Penalty for new topics
  },
  "commit": {
    "maxTitleLength": 72, // Maximum length of commit title
    "maxBodyLength": 500, // Maximum length of commit body
    "wrapBody": 72, // Wrap commit body at this column
    "includeBody": true, // Include body in commit message
    "includeFooter": true // Include footer in commit message
  },
  "debug": {
    "enabled": false, // Enable debug logging
    "logLevel": "INFO" // Log level (DEBUG, INFO, WARN, ERROR)
  }
}
```

### Environment Variables

- `OPENAI_KEY`: Your OpenAI API key (required)

## Usage

### Basic Usage

```bash
# Generate a commit message for staged changes
aico

# Show debug information
aico -d

# Show help
aico --help
```

### Interactive Workflow

1. Stage your changes using `git add`
2. Run `aico`
3. Optionally provide context to guide the AI
4. Review the generated commit message
5. Choose an action:
   - Accept and commit
   - Edit message
   - Regenerate message
   - Cancel

### Command Options

```bash
Options:
  -d, --debug           Enable debug logging
  -m, --mini            Use lighter GPT-4o-mini model
  -c, --context         Prompt for user context before generating commit message
  --no-auto-stage       Disable automatic staging of changes
  -h, --help            Display help information
```

By default, aico will:

1. Auto-stage all changes (use `--no-auto-stage` to disable)
2. Skip user context prompt (use `-c` to enable)
3. Always ask for confirmation before committing
4. Use the GPT-4o-mini model for better performance (use `-f` for full GPT-4o model)

### Branch Name Generation

AICO can also help you generate meaningful branch names based on your changes or description:

```bash
# Generate a branch name
aico -b

# Generate a branch name with context
aico -b -c
```

When generating branch names, you'll be prompted to:

1. Provide context about the work you're planning
2. Review the generated branch name
3. Choose to:
   - Create and switch to the branch
   - Copy the branch name to clipboard
   - Regenerate with new context
   - Cancel

## Commit Message Format

The generated commit messages follow the Conventional Commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or modifying tests
- `chore`: Maintenance tasks

## Development

```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install

# Build the project
npm run build

# Link for local development
npm link

# Run tests
npm test

# Run linting
npm run lint
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details
