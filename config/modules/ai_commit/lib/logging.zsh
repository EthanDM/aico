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
    local log_responses=${DEBUG_CONFIG[LOG_API_RESPONSES]}
    
    # Show API responses in debug mode or if specifically enabled
    if [[ "$debug" == "true" || "$log_responses" == "true" ]]; then
        echo "\n${LOG_COLORS[DEBUG]}🔍 API Response Details:${LOG_COLORS[RESET]}" >&2
        
        # First try to parse and extract content
        local content
        if content=$(echo "$response" | jq -r '.choices[0].message.content' 2>/dev/null); then
            if [[ "$content" != "null" && -n "$content" ]]; then
                echo "${LOG_COLORS[DEBUG]}Generated Content:${LOG_COLORS[RESET]}" >&2
                echo "$content" >&2
                echo "" >&2
            fi
        fi

        # Show full response with colored JSON if in debug mode
        if [[ "$debug" == "true" ]]; then
            echo "${LOG_COLORS[DEBUG]}Full Response:${LOG_COLORS[RESET]}" >&2
            if echo "$response" | jq '.' >/dev/null 2>&1; then
                echo "$response" | jq -C '.' >&2
            else
                log_warn "Response is not valid JSON"
                echo "${LOG_COLORS[DEBUG]}$response${LOG_COLORS[RESET]}" >&2
            fi
        fi
        
        echo "" >&2  # Add a blank line after response
    fi

    # Return the content if it was successfully extracted
    if [[ -n "$content" && "$content" != "null" ]]; then
        echo "$content"
    else
        return 1
    fi
} 