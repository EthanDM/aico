#!/usr/bin/env zsh

#
# main.zsh - Main Entry Point
#
# This module serves as the main entry point for the AI Commit feature.
# It handles component initialization and sets up user-friendly aliases.
#

# Base directory for the project
export AI_COMMIT_ROOT="${0:h}/../.."

# Source components in dependency order
source "${AI_COMMIT_ROOT}/config/config.zsh"     # Configuration
source "${AI_COMMIT_ROOT}/lib/logging.zsh"       # Logging utilities
source "${AI_COMMIT_ROOT}/src/api/openai.zsh"    # OpenAI API
source "${AI_COMMIT_ROOT}/src/git/clean_diff.zsh" # Git diff cleaning
source "${AI_COMMIT_ROOT}/src/git/smart_diff.zsh" # Smart diff generation
source "${AI_COMMIT_ROOT}/src/git/do_commit.zsh"  # Git commit execution
source "${AI_COMMIT_ROOT}/src/core/commit.zsh"    # Core commit logic
source "${AI_COMMIT_ROOT}/src/utils/help.zsh"     # Help documentation

# Create user-friendly aliases with descriptive names
alias commit='ai_commit'       # Main commit command
alias commit-help='ai_commit -h' # Help command

# Remove old alias if it exists (cleanup)
unalias ai_commit 2>/dev/null

# Log successful initialization
# log_debug "AI Commit initialized successfully" 