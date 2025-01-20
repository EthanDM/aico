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
function call_openai_api() {
    local model=${1:-${AI_CONFIG[DEFAULT_MODEL]}}
    local diff_content=$3

    validate_api_prerequisites || return 1

    # Get git status for more context
    local git_status=$(command git status --short)

    # Branch Name
    local branch_name=$(command git rev-parse --abbrev-ref HEAD)

    # Last 5 commits
    local last_5_commits=$(command git log -n 5 --pretty=format:"%h - %s")

    # Prepare enhanced prompt
    local prompt="Generate a git commit message following these guidelines:
    1. Use the Conventional Commit format (feat, fix, docs, style, refactor, test, chore).
    2. Include a summary of the changes under ${COMMIT_CONFIG[MAX_TITLE_LENGTH]} characters.
    3. Provide additional details in the body, formatted as bullet points if necessary.
    4. Use imperative mood (e.g., 'Add', 'Fix', 'Update').
    5. DO NOT INCLUDE BACKTICKS, CODE BLOCKS, OR ANY OTHER MARKUP.
    6. Use \"\\n\" to explicitly indicate line breaks in the content response. DO NOT USE ANY OTHER LINE BREAK MARKUP.
    7. DOUBLE CHECK ALL RETURNS ARE ESCAPED FOR VALID JSON.
    8. DO NOT INCLUDE ANY OTHER MARKUP OR CODE BLOCKS. JUST THE COMMIT MESSAGE.
    9. DO NOT USE ANY OTHER LINE BREAK MARKUP. JUST USE \\n.

    Git Status:
    $git_status

    Branch Name:
    $branch_name

    Last 5 Commits:
    $last_5_commits

    Changes:
    $diff_content"


    # Sanitize fields for JSON payload
    local escaped_prompt=$(jq -R <<< "$prompt")

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

    log_info "Generating enhanced commit message using $model..." >&2

    # Make the API request with properly escaped JSON
    local response=$(curl -s https://api.openai.com/v1/chat/completions \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $OPENAI_KEY" \
        -d "$json_data" 2>/dev/null)


    # Check for curl errors
    # if [ $? -ne 0 ]; then
    #     log_error "Failed to connect to the OpenAI API." >&2
    #     return 1
    # fi


    commit_msg=$(echo "$response" | jq -r '.choices[0].message.content')


    # Check for API errors
    # if echo "$response" | grep -q '"error":'; then
    #     handle_api_error "$response" >&2
    #     return 1
    # fi

    # Log the response for debugging
    # log_api_response "$response" >&2



    # Ensure the content is not empty or null
    if [[ -z "$commit_msg" || "$commit_msg" == "null" ]]; then
        log_error "The OpenAI API returned an empty or null commit message." >&2
        log_debug "Raw API Response:\n$response" >&2
        return 1
    fi


    # Check if we got a valid commit message back
    if [[ $? -ne 0 || -z "$commit_msg" ]]; then
        log_error "Failed to extract a valid commit message from the API response." >&2
        log_debug "Raw API Response:\n$response" >&2
        return 1
    fi

    echo "$commit_msg"
}
