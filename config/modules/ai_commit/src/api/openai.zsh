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
    local error_message
    
    # Try to extract error message from JSON response
    if error_message=$(echo "$response" | jq -r '.error.message' 2>/dev/null); then
        if [[ "$error_message" != "null" && -n "$error_message" ]]; then
            log_error "${ERROR_MESSAGES[API_ERROR]}"
            log_debug "Error Details: $error_message"
            return 1
        fi
    fi
    
    # Fallback for non-JSON errors
    error_message=$(echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    if [[ -n "$error_message" ]]; then
        log_error "${ERROR_MESSAGES[API_ERROR]}"
        log_debug "Error Details: $error_message"
    else
        log_error "${ERROR_MESSAGES[API_ERROR]}"
        log_debug "Failed to parse error response"
    fi
    return 1
}

# Function to format commit message parts
function format_commit_message() {
    local raw_content=$1
    local subject=""
    local body=""
    local footer=""
    
    # Split content into lines
    local lines=("${(@f)raw_content}")
    
    # Get subject (first non-empty line)
    for line in $lines; do
        if [[ -n "$line" ]]; then
            subject="$line"
            break
        fi
    done
    
    # Get body and footer
    local in_body=false
    local in_footer=false
    local temp_body=""
    local temp_footer=""
    
    for line in $lines; do
        # Skip the subject line
        [[ "$line" == "$subject" ]] && continue
        
        # Empty line after subject starts body
        if [[ -z "$line" && "$in_body" == "false" && -n "$subject" ]]; then
            in_body=true
            continue
        fi
        
        # If line starts with "BREAKING CHANGE:" or "Closes" or "Fixes", it's footer
        if [[ "$line" =~ ^(BREAKING CHANGE:|Closes|Fixes) ]]; then
            in_footer=true
            in_body=false
        fi
        
        if [[ "$in_footer" == "true" ]]; then
            temp_footer+="$line"$'\n'
        elif [[ "$in_body" == "true" && -n "$line" ]]; then
            temp_body+="$line"$'\n'
        fi
    done
    
    # Combine parts with proper spacing
    local result="$subject"
    [[ -n "$temp_body" ]] && result+=$'\n\n'"${temp_body%$'\n'}"
    [[ -n "$temp_footer" ]] && result+=$'\n\n'"${temp_footer%$'\n'}"
    
    echo "$result"
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
    local prompt="Generate a git commit message following the Conventional Commits format. Return ONLY the commit message without any markdown or code blocks.

Format Rules:
- Use the conventional commits format: <type>(<scope>): <description>
- Keep the first line under 72 characters
- Add a blank line after the first line if including a body
- Break body lines at 72 characters
- Use present tense and imperative mood
- Reference relevant issue numbers if found in the diff

Changed files:
$changed_files

Git Status:
$git_status

Changes:
$diff_content"

    # Create JSON payload using jq to properly escape special characters
    local json_payload
    json_payload=$(jq -n \
        --arg model "$model" \
        --arg system_content "You are a helpful git commit message generator. Generate clear, concise, and conventional commit messages based on the provided changes." \
        --arg user_content "$prompt" \
        '{
            model: $model,
            messages: [
                {role: "system", content: $system_content},
                {role: "user", content: $user_content}
            ],
            temperature: 0.7
        }')

    # Make the API request with properly escaped JSON
    local response
    response=$(curl -s -S -X POST "https://api.openai.com/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $OPENAI_KEY" \
        -d "$json_payload")

    # Log the response for debugging
    local commit_message
    commit_message=$(log_api_response "$response")
    
    if [[ $? -eq 0 && -n "$commit_message" ]]; then
        # Format the commit message
        format_commit_message "$commit_message"
        return 0
    else
        handle_api_error "$response"
        return 1
    fi
} 