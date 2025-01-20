#!/usr/bin/env zsh

#
# config.zsh - Configuration Settings
#
# This module contains all configuration settings and constants
# for the AI Commit feature.
#

# Log Levels (must be defined first)
typeset -A LOG_LEVELS
LOG_LEVELS=(
    [DEBUG]=0
    [INFO]=1
    [WARN]=2
    [ERROR]=3
)

# OpenAI API Configuration
typeset -A AI_CONFIG
AI_CONFIG=(
    [DEFAULT_MODEL]="gpt-4o-mini"
    [MAX_TOKENS]=300
    [TEMPERATURE]=0.5
    [TOP_P]=1
    [FREQUENCY_PENALTY]=0
    [PRESENCE_PENALTY]=0
)

# Commit Message Configuration
typeset -A COMMIT_CONFIG
COMMIT_CONFIG=(
    [MAX_TITLE_LENGTH]=72      # Maximum length of the subject line
    [MAX_BODY_LENGTH]=500      # Maximum length of the body
    [WRAP_BODY]=72             # Character limit for body line wrapping
    [INCLUDE_BODY]=true        # Whether to include body when changes are significant
    [INCLUDE_FOOTER]=true      # Whether to include footer for breaking changes/issues
)

# Debug Configuration
typeset -A DEBUG_CONFIG
DEBUG_CONFIG=(
    [ENABLE_DEBUG]=false        # Full debug mode
    [LOG_API_RESPONSES]=false   # API response logging
    [LOG_LEVEL]=${LOG_LEVELS[INFO]}  # Default log level
)

# Error Messages
typeset -A ERROR_MESSAGES
ERROR_MESSAGES=(
    [API_CONNECTION]="❌ Failed to connect to OpenAI API"
    [API_ERROR]="❌ API Error"
    [EMPTY_RESPONSE]="❌ Failed to generate commit message"
    [NO_CHANGES]="❌ No changes to commit"
    [NO_API_KEY]="❌ OPENAI_KEY environment variable not set"
    [INVALID_JSON]="❌ Invalid JSON response from API"
) 