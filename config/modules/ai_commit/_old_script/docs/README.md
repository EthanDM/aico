# AI Commit Module

A powerful, AI-powered git commit message generator that creates conventional commit messages based on your changes. This module integrates with your git workflow to provide intelligent, consistent commit messages.

## Overview

AI Commit is a standalone module that:

- Generates semantic commit messages using OpenAI's GPT models
- Follows conventional commit format
- Handles large diffs intelligently
- Provides interactive commit workflow
- Supports debug and logging features

## Directory Structure

```
modules/ai_commit/
├── src/              # Source code
│   ├── api/          # API integrations
│   │   └── openai.zsh  # OpenAI API client
│   ├── git/          # Git operations
│   │   ├── clean_diff.zsh  # Diff cleaning utilities
│   │   ├── smart_diff.zsh  # Smart diff generation
│   │   └── do_commit.zsh   # Commit execution
│   ├── utils/        # Utility functions
│   │   └── help.zsh    # Help documentation
│   └── core/         # Core functionality
│       ├── main.zsh    # Main entry point
│       └── commit.zsh  # Core commit logic
├── config/           # Configuration
│   └── config.zsh    # Settings and constants
├── lib/             # Common libraries
│   └── logging.zsh   # Logging utilities
└── docs/            # Documentation
    └── README.md     # This file
```

## Installation

The module is automatically loaded by the git utils system. No additional installation steps are required if you're using the dotfiles framework.

## Components

### Core Components

- **main.zsh**: Entry point and component initialization
- **commit.zsh**: Core commit message generation logic

### API Integration

- **openai.zsh**: OpenAI API client for generating commit messages

### Git Operations

- **clean_diff.zsh**: Cleans and filters git diffs
- **smart_diff.zsh**: Intelligent diff generation
- **do_commit.zsh**: Git commit execution

### Utilities

- **help.zsh**: Help documentation and usage information
- **logging.zsh**: Logging utilities with levels and formatting
- **config.zsh**: Configuration settings and constants

## Usage

```bash
# Basic usage
commit              # Interactive commit with GPT-4o-mini

# Options
commit -d           # Debug mode
commit -l           # Log API responses
commit -p           # Use GPT-4o for better analysis
commit -h           # Show help

# Quick Actions (during commit)
A                   # Accept and commit
E                   # Edit message
R                   # Regenerate message
V                   # View full diff
D                   # Toggle debug output
C                   # Cancel
```

## Configuration

The module's behavior can be customized through `config.zsh`:

- API settings (model, tokens, temperature)
- Commit message format
- Debug options
- Log levels

## Dependencies

- zsh
- git
- curl
- jq (for JSON processing)
- OpenAI API key (set as OPENAI_KEY environment variable)

## Integration

The module is designed to integrate seamlessly with your git workflow while maintaining its independence. It can be:

- Used directly through the `commit` command
- Integrated with other git tools
- Extended with additional features
- Used as a template for similar AI-powered tools
