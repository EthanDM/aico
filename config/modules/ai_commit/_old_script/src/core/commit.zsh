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


# Auto-stage changes
function ai_commit_auto_stage_changes() {
    echo "📦 Auto-staging all changes..."
    git add . || {
        echo "❌ Error: Failed to auto-stage changes"
        return 1
    }
}

# Get the list of changed files and the diff
function ai_commit_get_changes() {
    local debug=$1
    local token_limit=$2

    local raw_files diff_output processed_diff

    echo "debug: $debug"
    echo "token_limit: $token_limit"

    # Retrieve file changes and diffs based on staging
    raw_files=$(git diff --staged --name-only)
    diff_output=$(git diff --staged)

    # Display full diff in verbose mode
    if [ "$debug" = true ]; then
        echo -e "\n📄 Full diff:"
        echo "$diff_output"
    fi

    echo "diff_output: $diff_output"
    echo "token_limit: $token_limit"
    echo "debug: $debug"
    echo "verbose: $verbose"

    # Process the diff to fit within the token limit
    processed_diff=$(ai_commit_process_diff "$diff_output" "$token_limit" "$debug" "$verbose")

    echo "$processed_diff"  # Return both as a single string
}

# Process the diff output to fit within the token limit
function ai_commit_process_diff() {
    local diff_output=$1
    local token_limit=$2
    local debug=$3
    local verbose=$4

    local original_length=${#diff_output}
    local processed_diff=""

    echo "original_length: $original_length"
    echo "token_limit: $token_limit"
    echo "debug: $debug"
    echo "verbose: $verbose"
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


# AI-powered Git commit message generator
#
# Generates commit messages based on staged changes using AI.
# Options:
#   -d  Enable debug mode (detailed logs for debugging).
#   -l  Log API responses only.
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
    local skip_confirm=false  # Auto-accept generated message
    local verbose=false     # Verbose mode
    local OPTIND            # Option index for getopts

    # Parse command-line options
    while getopts "dlsavhp" opt; do
        case $opt in
            d) debug=true ;;      # Debug mode
            a) skip_confirm=true ;; # Skip confirmation
            v) verbose=true ;;    # Verbose mode
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

    # Check environment and changes
    ai_commit_check_environment || return 1
    ai_commit_has_changes_to_commit || return 1

    echo "🔍 Analyzing changes..."
    ai_commit_auto_stage_changes

    token_limit=20000

    # Main Section: Calling the helper functions
    local changes diff_output model
    changes=$(ai_commit_get_changes "$debug" "$token_limit")

# seems bash doesnt like echo in above function... doesnt show... odnt use funcs or?

        diff_output=$(git diff --staged)

    # Display full diff in verbose mode
    if [ "$debug" = true ]; then
        echo -e "\n📄 Full diff:"
        echo "$diff_output"
    fi

    # Extract outputs from helper functions
    diff_output=$(echo "$changes" | cut -d '|' -f 2)
    model='gpt-4o-mini'

    # Debug outputs (if enabled)
    if [ "$debug" = true ]; then
        echo "🔍 Debug: Model selected: $model"
        echo "🔍 Debug: Token limit: $token_limit"
        echo "🔍 Debug: Processed diff output length: ${#diff_output}"
    fi
    
    # Call the OpenAI API to generate commit message
    local commit_msg=$(call_openai_api "$model" "$processed_diff" "$debug")
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Show the changes and proposed message
    echo "\n📝 Changes to be committed:"
    command git status --short
    
    echo "\n💡 Proposed commit message:"
    echo "$commit_msg"
    
    # If skip_confirm is true and changes are staged, commit immediately
    if [ "$skip_confirm" = true ]; then
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
            do_commit "$commit_msg" false
            ;;
        e|E)
            # Use readline for better editing experience
            echo "\n✏️  Edit commit message (or press Enter to keep as is):"
            read -e -i "$commit_msg" modified_msg
            if [ ! -z "$modified_msg" ]; then
                do_commit "$modified_msg"
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
            command git diff --staged | less

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