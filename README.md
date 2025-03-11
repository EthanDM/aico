# aico

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

An AI-powered git commit message generator that creates conventional commit messages using OpenAI.

## Features

- 🤖 Generates semantic commit messages using AI
- 📝 Follows [Conventional Commits](https://www.conventionalcommits.org/) format
- 🔄 Interactive workflow with preview and edit options
- 🌳 Considers git branch context and recent commits
- 🎯 Supports user-provided message guidance
- 🌿 Generates meaningful branch names
- 🚀 Fast and efficient with GPT-4o-mini model
- 🔒 Secure API key management

## Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- Git
- OpenAI API key

## Installation

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

## Setting up your OpenAI API Key

AICO requires an OpenAI API key to function. You can get one from [OpenAI's website](https://platform.openai.com/api-keys). You have two options to provide it:

1. **Recommended: Save it in your configuration** (one-time setup)

   ```bash
   aico --set-api-key YOUR_API_KEY
   ```

   This saves your API key securely in `~/.config/aico/config.json`

2. **Alternative: Use an environment variable**
   ```bash
   export OPENAI_KEY=YOUR_API_KEY
   ```
   Add this to your shell's configuration file (e.g., .bashrc, .zshrc) to make it permanent.

## Quick Start

1. Stage your changes:

   ```bash
   git add .
   ```

2. Generate a commit message:

   ```bash
   aico
   ```

3. Or generate a branch name:
   ```bash
   aico -b
   ```

## Configuration

AICO can be configured in several ways:

### Command Line Options

```bash
Options:
  -d, --debug           Enable debug logging
  -f, --full            Use full GPT-4o model for this commit (default is mini)
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

AICO uses GPT-4o-mini by default for better performance and lower resource usage. You can:

- Use the full GPT-4o model for a single commit: `aico -f`
- Set GPT-4o as your default: `aico --set-default-model gpt-4o`
- Keep using GPT-4o-mini (default): `aico --set-default-model gpt-4o-mini`

For large diffs (>30K characters), AICO will prompt you to:

- Continue with GPT-4o (better quality, slightly higher cost)
- Switch to GPT-4o-mini (faster, cheaper)
- Cancel and break into smaller commits

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

## Examples

### Basic Commit

```bash
# Stage changes and generate commit message
git add .
aico

# Generate commit message with context
aico -c
```

### Branch Name Generation

```bash
# Generate a branch name for new feature
aico -b -c
# Enter context when prompted: "Add support for GitHub Actions integration"
# Result: feat/add-github-actions-integration
```

### Advanced Usage

```bash
# Use full GPT-4o model for important commits
aico -f

# Generate merge commit message
aico --merge

# Skip auto-staging
aico --no-auto-stage
```

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

## Interactive Workflow

1. Stage your changes using `git add`
2. Run `aico`
3. Optionally provide context to guide the AI
4. Review the generated commit message
5. Choose an action:
   - Accept and commit
   - Edit message
   - Regenerate message
   - Cancel

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## License

MIT © [Ethan Millstein](LICENSE)
