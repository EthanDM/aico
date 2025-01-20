#!/usr/bin/env zsh

#
# openai.zsh - OpenAI API Integration
#
# This module handles all interactions with the OpenAI API.
#

source "${0:h}/../../lib/logging.zsh"
source "${0:h}/../../config/config.zsh"

# Function to validate API prerequisites
function validate_api_prerequisites() {
    if [[ -z "$OPENAI_KEY" ]]; then
        log_error "${ERROR_MESSAGES[NO_API_KEY]}"
        return 1
    fi
    return 0
}

# Function to handle API errors
function handle_api_error() {
    local response=$1
    local error_message=$(echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    
    log_error "${ERROR_MESSAGES[API_ERROR]}"
    log_debug "Error Details: $error_message"
    return 1
}

# Function to make API request and handle response
function call_openai_api() {
    local model=${1:-${AI_CONFIG[DEFAULT_MODEL]}}
    local changed_files=$2
    local diff_content=$3
    
    validate_api_prerequisites || return 1
    
    # Get git status for more context
    local git_status=$(command git status --short)
    
    # Prepare the prompt
    local prompt="Generate a concise git commit message for these changes. Use conventional commit format (feat/fix/docs/style/refactor/test/chore). Keep under ${COMMIT_CONFIG[MAX_TITLE_LENGTH]} chars.

Git Status:
$git_status

Files changed: $changed_files

Changes:
$diff_content"
    
    # Create the JSON payload using jq
    local json_data=$(jq -n \
        --arg model "$model" \
        --arg content "$prompt" \
        --argjson temp "${AI_CONFIG[TEMPERATURE]}" \
        --argjson max_tokens "${AI_CONFIG[MAX_TOKENS]}" \
        --argjson top_p "${AI_CONFIG[TOP_P]}" \
        --argjson freq_pen "${AI_CONFIG[FREQUENCY_PENALTY]}" \
        --argjson pres_pen "${AI_CONFIG[PRESENCE_PENALTY]}" \
        '{
            model: $model,
            messages: [{role: "user", content: $content}],
            temperature: $temp,
            max_tokens: $max_tokens,
            top_p: $top_p,
            frequency_penalty: $freq_pen,
            presence_penalty: $pres_pen
        }')
    
    log_info "Generating commit message using $model..." >&2
    
    # Make the API request with properly escaped JSON
    local response=$(curl -s https://api.openai.com/v1/chat/completions \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $OPENAI_KEY" \
        -d "$json_data" 2>/dev/null)
    
    # Check for curl errors
    if [ $? -ne 0 ]; then
        log_error "${ERROR_MESSAGES[API_CONNECTION]}" >&2
        log_debug "Curl command failed" >&2
        return 1
    fi
    
    # Check for API errors
    if echo "$response" | grep -q '"error":'; then
        handle_api_error "$response" >&2
        return 1
    fi
    
    # Log the response for debugging
    log_api_response "$response" >&2
    
    # Extract and clean the message from the response
    local commit_msg=$(echo "$response" | \
        grep -o '"content": *"[^"]*"' | \
        head -n1 | \
        sed 's/"content": *"//g' | \
        sed 's/"$//g' | \
        sed 's/```[[:alpha:]]*//g' | \
        sed 's/```//g' | \
        tr -d '\n\r' | \
        xargs)
    
    # Check for empty response
    if [ -z "$commit_msg" ]; then
        log_error "${ERROR_MESSAGES[EMPTY_RESPONSE]}" >&2
        log_debug "Raw API Response:\n$response" >&2
        return 1
    fi
    
    # Only output the commit message to stdout
    echo "$commit_msg"
} 