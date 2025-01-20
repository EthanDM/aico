# Ensure required environment variables are set
function ai_commit_check_environment() {
    if [ -z "$OPENAI_KEY" ]; then
        echo "❌ Error: Missing required environment variable: OPENAI_KEY"
        return 1
    fi
}

# Check if there are changes to commit
function ai_commit_has_changes_to_commit() {
    if [ -z "$(git status --porcelain)" ]; then
        echo "❌ No changes to commit"
        return 1
    fi
}

# Determine if there are staged changes
function ai_commit_has_staged_changes() {
    if [ -n "$(git diff --staged --name-only)" ]; then
        echo true
    else
        echo false
    fi
}

# Auto-stage changes if enabled
function ai_commit_auto_stage_changes() {
    local auto_stage=$1
    local staged=$2
    if [ "$auto_stage" = true ] && [ "$staged" = false ]; then
        echo "📦 Auto-staging all changes..."
        git add . || {
            echo "❌ Error: Failed to auto-stage changes"
            return 1
        }
    fi
}

# Get the list of changed files and the diff
function ai_commit_get_changes() {
    local staged=$1
    local verbose=$2
    local debug=$3
    local token_limit=$4

    local raw_files diff_output changed_files processed_diff

    # Retrieve file changes and diffs based on staging
    if [ "$staged" = true ]; then
        raw_files=$(git diff --staged --name-only)
        diff_output=$(git diff --staged)
    else
        raw_files=$(git diff --name-only)
        diff_output=$(git diff)
    fi

    # Format the list of changed files
    changed_files=$(echo "$raw_files" | paste -sd " " -)

    # Display full diff in verbose mode
    if [ "$verbose" = true ]; then
        echo -e "\n📄 Full diff:"
        echo "$diff_output"
    fi

    # Process the diff to fit within the token limit
    processed_diff=$(ai_commit_process_diff "$diff_output" "$token_limit" "$debug" "$verbose")

    echo "$changed_files|$processed_diff"  # Return both as a single string
}

# Process the diff output to fit within the token limit
function ai_commit_process_diff() {
    local diff_output=$1
    local token_limit=$2
    local debug=$3
    local verbose=$4

    local original_length=${#diff_output}
    local processed_diff=""

    if [ "$original_length" -gt "$token_limit" ]; then
        # Use smart_diff for large diffs
        processed_diff=$(smart_diff "$diff_output" "$token_limit" "$debug" "$verbose")
    else
        # Escape control characters and prepare for JSON
        processed_diff=$(echo "$diff_output" | \
            perl -pe 's/[\x00-\x1F\x7F-\xFF]/./g' | \
            sed 's/\\/\\\\/g' | \
            sed 's/"/\\"/g' | \
            tr '\n' ' ')
        
        if [ "$debug" = true ] || [ "$verbose" = true ]; then
            echo -e "\n📊 Diff size: $original_length characters (under $token_limit limit, using full diff)" >&2
        fi
    fi

    echo "$processed_diff"
}

# Determine the AI model and token limit based on options
function ai_commit_set_model() {
    local use_4o=$1

    local model="gpt-4o-mini"
    local token_limit=20000

    if [ "$use_4o" = true ]; then
        model="gpt-4o"
        token_limit=12000  # Adjusted token limit for GPT-4o
    fi

    # First output the model and token limit without any other text
    echo "$model|$token_limit"
    
    # Then output the status message separately
    if [ "$use_4o" = true ]; then
        echo "🚀 Using GPT-4o for enhanced response..." >&2
    else
        echo "🤖 Using GPT-4o-mini for quick response..." >&2
    fi
}

# AI-powered Git commit message generator
#
# Generates commit messages based on staged changes using AI.
# Options:
#   -d  Enable debug mode (detailed logs for debugging).
#   -l  Log API responses only.
#   -s  Auto-stage all unstaged changes.
#   -a  Skip confirmation and auto-accept the generated message.
#   -v  Enable verbose mode (show full diff).
#   -p  Use GPT-4o for enhanced responses.
#   -h  Show help for the function.
#
# Usage:
#   ai_commit -dlsa
#   ai_commit -p
function ai_commit() {
    # Parse options
    local debug=false       # Enable debug mode
    local log_api=false     # Log API responses only
    local auto_stage=false  # Auto-stage all changes
    local skip_confirm=false  # Auto-accept generated message
    local verbose=false     # Verbose mode
    local use_4o=false      # Use GPT-4o model
    local OPTIND            # Option index for getopts

    # Parse command-line options
    while getopts "dlsavhp" opt; do
        case $opt in
            d) debug=true ;;      # Debug mode
            l) log_api=true ;;    # Log API responses only
            s) auto_stage=true ;; # Auto-stage changes
            a) skip_confirm=true ;; # Skip confirmation
            v) verbose=true ;;    # Verbose mode
            p) use_4o=true ;;     # Use GPT-4o
            h) ai_commit_help; return 0 ;; # Show help
        esac
    done
    shift $((OPTIND-1))  # Remove processed options from arguments

    # Set debug configuration
    if [ "$debug" = true ]; then
        DEBUG_CONFIG[ENABLE_DEBUG]=true
        DEBUG_CONFIG[LOG_LEVEL]="DEBUG"
    else
        DEBUG_CONFIG[ENABLE_DEBUG]=false
        DEBUG_CONFIG[LOG_LEVEL]="INFO"
    fi
    DEBUG_CONFIG[LOG_API_RESPONSES]=$log_api

    # Check environment and changes
    ai_commit_check_environment || return 1
    ai_commit_has_changes_to_commit || return 1

    echo "🔍 Analyzing changes..."
    local staged
    staged=$(ai_commit_has_staged_changes)

    ai_commit_auto_stage_changes "$auto_stage" "$staged" || return 1

    # Main Section: Calling the helper functions
    local changes diff_output model token_limit
    changes=$(ai_commit_get_changes "$staged" "$verbose" "$debug" "$token_limit")
    model_and_limit=$(ai_commit_set_model "$use_4o")

    echo "model_and_limit: $model_and_limit"

    # Extract outputs from helper functions
    changed_files=$(echo "$changes" | cut -d '|' -f 1)
    diff_output=$(echo "$changes" | cut -d '|' -f 2)
    model=$(echo "$model_and_limit" | cut -d '|' -f 1)
    token_limit=$(echo "$model_and_limit" | cut -d '|' -f 2)

    # Debug outputs (if enabled)
    if [ "$debug" = true ]; then
        echo "🔍 Debug: Model selected: $model"
        echo "🔍 Debug: Token limit: $token_limit"
        echo "🔍 Debug: Changed files: $changed_files"
        echo "🔍 Debug: Processed diff output length: ${#diff_output}"
    fi
    
    # Call the OpenAI API to generate commit message
    local commit_msg=$(call_openai_api "$model" "$changed_files" "$processed_diff" "$debug")
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Show the changes and proposed message
    echo "\n📝 Changes to be committed:"
    if [ "$staged" = false ]; then
        echo "\n⚠️  Warning: No changes are staged. Showing all changes:"
    fi
    command git status --short
    
    echo "\n💡 Proposed commit message:"
    echo "$commit_msg"
    
    # If skip_confirm is true and changes are staged, commit immediately
    if [ "$skip_confirm" = true ] && [ "$staged" = true ]; then
        echo "\n✨ Auto-committing changes..."
        do_commit "$commit_msg"
        return
    fi
    
    # Interactive mode with single-key input
    echo "\nQuick actions (no Enter needed):"
    echo "  [A] Accept and commit              [E] Edit message"
    echo "  [R] Regenerate message             [S] Stage all & commit"
    echo "  [V] View full diff                 [C] Cancel"
    echo -n "\nAction: "
    
    # Read a single character without requiring Enter
    read -sk 1 choice
    echo # Add newline after choice
    
    case "$choice" in
        a|A)
            if [ "$staged" = false ]; then
                echo "❌ No changes staged for commit. Use 'S' to stage all changes."
                return 1
            fi
            do_commit "$commit_msg" false
            ;;
        e|E)
            # Use readline for better editing experience
            echo "\n✏️  Edit commit message (or press Enter to keep as is):"
            read -e -i "$commit_msg" modified_msg
            if [ ! -z "$modified_msg" ]; then
                do_commit "$modified_msg" "$staged"
            else
                echo "❌ Commit cancelled - empty message"
            fi
            ;;
        r|R)
            echo "\n🔄 Regenerating commit message..."
            ai_commit
            ;;
        s|S)
            echo "\n📦 Staging all changes..."
            do_commit "$commit_msg" true
            ;;
        v|V)
            echo "\n📄 Full diff:"
            if [ "$staged" = true ]; then
                command git diff --staged | less
            else
                command git diff | less
            fi
            # After viewing diff, recall the menu
            ai_commit
            ;;
        c|C|$'\e'|$'\x1b')  # Handle C, c, Escape, and Ctrl-C
            echo "❌ Commit cancelled"
            return 1
            ;;
        *)
            echo "❌ Invalid choice"
            return 1
            ;;
    esac
} 