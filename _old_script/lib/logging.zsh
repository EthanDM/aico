#!/usr/bin/env zsh

#
# logging.zsh - Logging Library
#
# This module provides logging functionality with different levels,
# colors, and formatting options.
#

source "${0:h}/../config/config.zsh"

# Log colors
typeset -A LOG_COLORS
LOG_COLORS=(
    [DEBUG]="\033[36m"  # Cyan
    [INFO]="\033[32m"   # Green
    [WARN]="\033[33m"   # Yellow
    [ERROR]="\033[31m"  # Red
    [RESET]="\033[0m"
)

# Icons for different log types
typeset -A LOG_ICONS
LOG_ICONS=(
    [DEBUG]="🔍"
    [INFO]="ℹ️ "
    [WARN]="⚠️ "
    [ERROR]="❌"
)

# Main logging function
function log() {
    local level=$1
    local message=$2
    local debug=${DEBUG_CONFIG[ENABLE_DEBUG]}
    local current_level=${LOG_LEVELS[$level]}
    local min_level=${LOG_LEVELS[${DEBUG_CONFIG[LOG_LEVEL]}]}

    # Only show messages at or above the current log level
    if (( current_level < min_level )); then
        return 0
    fi

    # Format the log message
    local color="${LOG_COLORS[$level]}"
    local icon="${LOG_ICONS[$level]}"
    local reset="${LOG_COLORS[RESET]}"
    
    # Send all logs to stderr by default
    echo "${color}${icon} ${message}${reset}" >&2
}

# Convenience functions for different log levels
function log_debug() { log "DEBUG" "$1"; }
function log_info() { log "INFO" "$1"; }
function log_warn() { log "WARN" "$1"; }
function log_error() { log "ERROR" "$1"; }

# Function to log API responses in a clean format
function log_api_response() {
    local response=$1
    local debug=${DEBUG_CONFIG[ENABLE_DEBUG]}

    # Show API responses in debug mode or if specifically enabled
    if [[ "$debug" == "true" ]]; then
        echo "\n${LOG_COLORS[DEBUG]}🔍 API Response Details:${LOG_COLORS[RESET]}" >&2

        # Clean control characters and escape sequences before processing
        local cleaned_response=$(echo "$response" | tr -d '\000-\037' | sed 's/\r//g')

        # Extract content safely
        local content
        if content=$(echo "$cleaned_response" | jq -r '.choices[0].message.content' 2>/dev/null); then
            if [[ "$content" != "null" && -n "$content" ]]; then
                echo "${LOG_COLORS[DEBUG]}Generated Content:${LOG_COLORS[RESET]}" >&2
                # Clean any remaining backticks and language specifiers while preserving line breaks
                content=$(echo "$content" | sed -E '
                    s/^```[a-zA-Z]*\n?//
                    s/```$//
                    s/^[[:space:]]*//
                    s/[[:space:]]*$//
                ')
                echo "$content" >&2
            else
                echo "${LOG_COLORS[WARN]}⚠️  Could not extract content from response.${LOG_COLORS[RESET]}" >&2
                return 1
            fi
        else
            echo "${LOG_COLORS[WARN]}⚠️  Could not parse response as JSON.${LOG_COLORS[RESET]}" >&2
            return 1
        fi

        # Check for truncation
        if echo "$cleaned_response" | jq -e '.choices[0].finish_reason == "length"' >/dev/null 2>&1; then
            echo "${LOG_COLORS[WARN]}⚠️  Response was truncated due to length limits.${LOG_COLORS[RESET]}" >&2
        fi

        # Full response in debug mode
        if [[ "$debug" == "true" ]]; then
            echo "${LOG_COLORS[DEBUG]}Full Response:${LOG_COLORS[RESET]}" >&2
            echo "$cleaned_response" | jq -C '.' 2>/dev/null || echo "$cleaned_response" >&2
        fi

        echo "" >&2  # Blank line after response
    fi

    # Always return the cleaned content, even if logging is disabled
    if [[ -n "$content" && "$content" != "null" ]]; then
        # Ensure proper line breaks in commit message format
        echo "$content" | awk '
            NR==1 {print; print ""}  # Print first line (title) followed by blank line
            NR>1 {print}             # Print remaining lines (body)
        '
        return 0
    fi
    return 1
}
