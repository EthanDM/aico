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

# Generate a commit message with guidance
aico -m "Updated the login component"

# Show debug information
aico -d

# Show help
aico --help
```

### Interactive Workflow

1. Stage your changes using `git add`
2. Run `aico`
3. Review the generated commit message
4. Choose an action:
   - Accept and commit
   - Edit message
   - Regenerate message
   - Cancel

### Command Options

```bash
Options:
  -m, --message <string>  Provide guidance for the commit message
  -d, --debug            Enable debug logging
  -h, --help            Display help information
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

````markdown:config/modules/ai_commit/INSTALL.md
# Installing aico in dotfiles

1. Navigate to the module directory:
```bash
cd config/modules/ai_commit
````

2. Install dependencies:

```bash
npm install
```

3. Build the package:

```bash
npm run build
```

4. Link the package globally:

```bash
npm link
```

5. Configure OpenAI:
   Create `~/.config/aico/config.json`:

```json
{
  "openai": {
    "apiKey": "your-api-key-here"
  }
}
```

6. Test the installation:

```bash
aico --help
```

If you get permission errors:

```

```
