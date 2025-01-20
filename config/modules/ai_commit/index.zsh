#!/usr/bin/env zsh

#
# index.zsh - Main Entry Point for AI Commit
#
# This module serves as the main entry point for the AI Commit feature.
# It handles component initialization and sets up user-friendly aliases.
#
# Components are loaded in dependency order to ensure proper functionality:
# 1. Configuration (settings and constants)
# 2. Logging (debug and error handling)
# 3. API Integration (OpenAI communication)
# 4. Diff Processing (git diff handling)
# 5. Smart Diff (intelligent diff generation)
# 6. Commit Execution (git commit handling)
# 7. Main Logic (core functionality)
# 8. Help Documentation
#

# Source configuration and logging first
source "${0:h}/config.zsh"
source "${0:h}/logging.zsh"

# Source all AI commit components in dependency order
source "${0:h}/api.zsh"        # API integration
source "${0:h}/clean_diff.zsh" # Diff processing utilities
source "${0:h}/smart_diff.zsh" # Smart diff generation
source "${0:h}/do_commit.zsh"  # Commit execution
source "${0:h}/commit.zsh"     # Main commit logic
source "${0:h}/help.zsh"       # Help documentation

# Create user-friendly aliases with descriptive names
alias commit='ai_commit'       # Main commit command
alias commit-help='ai_commit -h' # Help command

# Remove old alias if it exists (cleanup)
unalias ai_commit 2>/dev/null

# Log successful initialization
# log_debug "AI Commit initialized successfully" 