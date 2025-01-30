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

### Global Installation

```bash
npm install -g aico
```

### Local Installation

```bash
npm install aico
```

## Configuration

Create a configuration file at `~/.config/aico/config.json`:

```json
{
  "openai": {
    "apiKey": "your-api-key-here",
    "model": "gpt-3.5-turbo",
    "maxTokens": 500,
    "temperature": 0.7,
    "topP": 1,
    "frequencyPenalty": 0,
    "presencePenalty": 0
  },
  "git": {
    "skipHooks": false
  }
}
```

Alternatively, you can use environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key
- `OPENAI_MODEL`: The model to use (default: "gpt-3.5-turbo")

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
  -d, --debug            Enable debug logging
  -m, --mini            Use lighter GPT-4o-mini model
  -c, --context         Prompt for user context before generating commit message
  --no-auto-stage       Disable automatic staging of changes
  -h, --help            Display help information
```

By default, aico will:

1. Auto-stage all changes (use `--no-auto-stage` to disable)
2. Skip user context prompt (use `-c` to enable)
3. Always ask for confirmation before committing
4. Use the full GPT-4o model (use `-m` for lighter model)

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

Let's also create a shorter installation guide for your dotfiles:

```

```
