# aico

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

An intelligent AI-powered CLI tool that generates semantic git commit messages and branch names using OpenAI's GPT models. Built with TypeScript and designed for developer productivity.

## 🎯 Overview

AICO (AI Commits) analyzes your git changes and automatically generates conventional commit messages that follow best practices. It understands code context, considers recent commits, and creates meaningful, consistent commit messages that improve project history readability.

## ✨ Key Features

- 🤖 **AI-Powered Generation**: Uses OpenAI GPT-4o models to understand code changes
- 📝 **Conventional Commits**: Follows [Conventional Commits](https://www.conventionalcommits.org/) specification
- 🔄 **Interactive Workflow**: Preview, edit, regenerate, or accept generated messages
- 🌳 **Smart Context**: Analyzes git branch names, recent commits, and diff patterns
- 🌿 **Branch Name Generation**: Creates semantic branch names from descriptions
- ⚡ **Performance Optimized**: Uses GPT-4o-mini by default for speed and cost efficiency
- 🛡️ **Secure Configuration**: Safe API key storage in user config directory
- 🎨 **Rich CLI Experience**: Colorful interface with figlet banners and progress indicators

## 🏗️ Architecture

The project follows a service-oriented architecture with clear separation of concerns:

```
src/
├── cli.ts                    # CLI entry point
├── services/                 # Core business logic
│   ├── Config.service.ts     # Configuration management
│   ├── OpenAI.service.ts     # OpenAI API integration
│   ├── Git.service.ts        # Git operations
│   ├── UI.service.ts         # User interface interactions
│   ├── Workflow.service.ts   # Main application workflow
│   ├── Program.service.ts    # CLI program setup
│   ├── AppLog.service.ts     # Application logging
│   └── Logger.service.ts     # Generic logging utility
├── processors/
│   └── Diff.processor.ts     # Git diff analysis and processing
├── constants/
│   ├── openai.constants.ts   # OpenAI system prompts
│   └── patterns.ts           # Regex patterns for parsing
└── types/
    └── index.ts              # TypeScript type definitions
```

## 🚀 Quick Start

### Prerequisites

- Node.js 16+
- npm 7+
- Git
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### Installation

1. **Clone and build**:

   ```bash
   git clone https://github.com/EthanDM/aico.git
   cd aico
   npm install
   npm run build
   ```

2. **Make globally available**:

   ```bash
   chmod +x dist/cli.js
   npm link
   ```

3. **Set up your API key** (one-time setup):
   ```bash
   aico --set-api-key YOUR_OPENAI_API_KEY
   ```

### Basic Usage

```bash
# Stage your changes
git add .

# Generate and apply commit message
aico

# Generate with interactive context prompt
aico -c

# Generate with inline context
aico -c "fix authentication bug with JWT validation"

# Generate with positional context (no flags needed)
aico "optimize database queries for better performance"

# Generate branch name with context
aico -b -c "add user profile feature"
```

### Context Usage Patterns

AICO supports three ways to provide context for better commit message generation:

#### 1. Interactive Context (Traditional)

```bash
aico -c
# Prompts: "Add context to help guide the AI:"
# Best for: When you want to see the diff first, then decide what context to add
```

#### 2. Inline Context (Fast)

```bash
aico -c "fix memory leak in event handlers"
aico --context "refactor authentication to use OAuth2"
# Best for: When you know exactly what context you want to provide upfront
```

#### 3. Positional Context (Fastest)

```bash
aico "implement user preferences dashboard"
aico "resolve merge conflicts in user service"
# Best for: Ultimate speed - no flags needed when you have context
# Note: If you use quotes, shell treats it as one argument
```

**Context Tips:**

- Keep context concise but descriptive (under 100 characters works best)
- Focus on the "why" rather than the "what" (the diff shows the "what")
- Examples: "fix production bug", "improve performance", "add new feature"

## 🛠️ Configuration

### Command Line Options

```bash
aico [options] [context]

Options:
  -d, --debug              Enable debug logging with detailed output
  -f, --full               Use GPT-4o model instead of default GPT-4o-mini
  -c, --context [context]  Provide context for AI guidance (interactive if no value given)
  --no-auto-stage          Disable automatic staging of changes
  --merge                  Generate merge commit message
  --set-default-model      Set default model (gpt-4o | gpt-4o-mini)
  --set-api-key           Save OpenAI API key to config
  -b, --branch            Generate branch name instead of commit message
  -h, --help              Display help information
  -v, --version           Show version number

Arguments:
  context                  Context to guide AI generation (alternative to -c flag)
```

### Configuration File

AICO stores configuration in `~/.config/aico/config.json`:

```json
{
  "openai": {
    "model": "gpt-4o-mini", // Model selection
    "maxTokens": 500, // Response length limit
    "temperature": 0.5, // Creativity level (0-1)
    "topP": 1, // Response diversity
    "frequencyPenalty": 0, // Repetition penalty
    "presencePenalty": 0 // Topic novelty penalty
  },
  "commit": {
    "maxTitleLength": 72, // Commit title character limit
    "maxBodyLength": 500, // Commit body character limit
    "wrapBody": 72, // Body text wrapping column
    "includeBody": true, // Include descriptive body
    "includeFooter": true // Include footer information
  },
  "debug": {
    "enabled": false, // Debug mode toggle
    "logLevel": "INFO" // Logging verbosity level
  }
}
```

### Model Selection Strategy

- **GPT-4o-mini** (default): Faster, cost-effective, ideal for most commits
- **GPT-4o** (via `-f` flag): Higher quality for complex changes
- **Auto-prompting**: Large diffs (>30K chars) trigger model selection prompt

### Environment Variables

- `OPENAI_KEY`: Alternative to saved configuration (optional)

## 🔄 Interactive Workflow

1. **Analysis Phase**:

   - Detects unstaged changes and prompts for staging
   - Analyzes git diff and extracts meaningful patterns
   - Considers branch context and recent commit history

2. **Generation Phase**:

   - Processes diff through intelligent filtering
   - Sends optimized context to OpenAI API
   - Generates conventional commit message

3. **Review Phase**:

   - Displays generated message with syntax highlighting
   - Offers actions: Accept, Edit, Regenerate, or Cancel
   - Handles user modifications and re-generation

4. **Commit Phase**:
   - Executes git commit with final message
   - Provides confirmation and next steps

## 📝 Generated Commit Format

AICO generates commits following the Conventional Commits specification:

```
<type>(<scope>): <description>

- <change description 1>
- <change description 2>
- <change description 3>

[optional footer]
```

**Commit Types**:

- `feat`: New features or functionality
- `fix`: Bug fixes (explicitly visible in diff)
- `docs`: Documentation updates
- `style`: Code formatting and style changes
- `refactor`: Code restructuring without behavior change
- `test`: Test additions or modifications
- `chore`: Maintenance tasks, dependencies, configuration
- `build`: Build system or dependency changes
- `ci`: CI/CD pipeline modifications
- `revert`: Reverting previous commits

## 🌿 Branch Name Generation

Generate semantic branch names from natural language descriptions:

```bash
aico -b -c
# Input: "Add user authentication with JWT tokens"
# Output: feat/add-user-authentication-jwt-tokens
```

Branch naming follows the pattern: `<type>/<kebab-case-description>`

## 🔧 Advanced Usage

### Development Workflow Integration

```bash
# High-quality commits for important features
git add .
aico -f -c

# Quick commits during development
git add .
aico

# Merge commit handling
git merge feature-branch
aico --merge

# Branch creation workflow
aico -b -c
git checkout -b $(aico -b -c --output-only)
```

### Large Diff Handling

For large changes (>30K characters), AICO will:

1. Analyze diff complexity and size
2. Prompt for model selection (GPT-4o vs GPT-4o-mini)
3. Suggest breaking into smaller commits if needed
4. Provide fallback strategies for processing

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
aico -d  # Debug mode with verbose output
```

Debug output includes:

- Git diff analysis results
- OpenAI API request/response details
- Configuration loading steps
- Processing time metrics

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for:

- Development setup instructions
- Code style guidelines
- Testing requirements
- Pull request process

## 📋 Development

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/EthanDM/aico.git
cd aico

# Install dependencies
npm install

# Build in watch mode
npm run watch

# Test locally
npm run start -- --help
```

### Available Scripts

- `npm run build`: Compile TypeScript to JavaScript
- `npm run watch`: Build in watch mode for development
- `npm run start`: Run the CLI locally
- `npm run test`: Run test suite (Jest)
- `npm run lint`: Run ESLint for code quality
- `npm run prepare`: Pre-commit build hook

### Technology Stack

- **TypeScript**: Type-safe development
- **Commander.js**: CLI framework and argument parsing
- **Inquirer.js**: Interactive command-line interfaces
- **OpenAI SDK**: GPT model integration
- **simple-git**: Git operations wrapper
- **Zod**: Runtime type validation
- **Chalk**: Terminal color styling
- **Figlet**: ASCII art banners

## 📄 License

MIT © [Ethan Millstein](LICENSE)

## 🆘 Support

- 📋 [Issues](https://github.com/EthanDM/aico/issues): Bug reports and feature requests
- 💬 [Discussions](https://github.com/EthanDM/aico/discussions): Questions and community support
- 📖 [Wiki](https://github.com/EthanDM/aico/wiki): Extended documentation

---

_Built with ❤️ for developers who care about clean commit history_
