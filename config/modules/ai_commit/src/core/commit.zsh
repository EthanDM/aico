# AI-powered commit message generator
function ai_commit() {
    # Parse options
    local debug=false
    local log_api=false
    local auto_stage=false
    local skip_confirm=false
    local verbose=false
    local use_4o=false
    local OPTIND
    while getopts "dlsavhp" opt; do
        case $opt in
            d) debug=true ;;      # Debug mode - show all debug info
            l) log_api=true ;;    # Log API responses only
            s) auto_stage=true ;; # Auto-stage all changes
            a) skip_confirm=true ;; # Auto-accept generated message
            v) verbose=true ;;    # Verbose mode - show full diff
            p) use_4o=true ;;     # Use GPT-4o for enhanced responses
            h) ai_commit_help; return 0 ;;
        esac
    done
    shift $((OPTIND-1))

    # Set debug configuration
    DEBUG_CONFIG[ENABLE_DEBUG]=$debug
    DEBUG_CONFIG[LOG_API_RESPONSES]=$log_api
    DEBUG_CONFIG[LOG_LEVEL]=${LOG_LEVELS[${debug:+DEBUG}:-INFO]}

    # Check if OPENAI_KEY is set
    if [ -z "$OPENAI_KEY" ]; then
        echo "❌ Error: OPENAI_KEY environment variable is not set"
        return 1
    fi

    # Check if there are any changes to commit
    if [ -z "$(command git status --porcelain)" ]; then
        echo "❌ No changes to commit"
        return 1
    fi

    echo "🔍 Analyzing changes..."
    
    # Get the diff of staged changes, or all changes if nothing is staged
    local staged=true
    if [ -z "$(command git diff --staged --name-only)" ]; then
        staged=false
    fi
    
    # Auto-stage if flag is set
    if [ "$auto_stage" = true ] && [ "$staged" = false ]; then
        echo "📦 Auto-staging all changes..."
        command git add .
        staged=true
    fi
    
    # Get list of changed files and diff
    local changed_files=""
    local diff_output=""
    local raw_files=""
    
    if [ "$staged" = true ]; then
        raw_files=$(command git diff --staged --name-only)
        changed_files=$(echo "$raw_files" | paste -sd " " -)
        diff_output=$(command git diff --staged)
    else
        raw_files=$(command git diff --name-only)
        changed_files=$(echo "$raw_files" | paste -sd " " -)
        diff_output=$(command git diff)
    fi
    
    # Show full diff in verbose mode
    if [ "$verbose" = true ]; then
        echo "\n📄 Full diff:"
        echo "$diff_output"
    fi
    
    # Set model and token limit based on flag
    local model="gpt-4o-mini"
    local token_limit=20000
    if [ "$use_4o" = true ]; then
        model="gpt-4o"
        token_limit=12000   # Increased for GPT-4o as well
        echo "🚀 Using GPT-4o for enhanced response..."
    else
        echo "🤖 Using GPT-4o-mini for quick response..."
    fi
    
    # Process the diff based on its length
    local original_length=${#diff_output}
    local processed_diff=""
    
    if [ $original_length -gt $token_limit ]; then
        # Run smart_diff and capture its output
        processed_diff=$(smart_diff "$diff_output" "$token_limit" "$debug" "$verbose")
    else
        processed_diff=$(echo "$diff_output" | \
            perl -pe 's/[\x00-\x1F\x7F-\xFF]/./g' | \
            sed 's/\\/\\\\/g' | \
            sed 's/"/\\"/g' | \
            tr '\n' ' ')
        
        if [ "$debug" = true ] || [ "$verbose" = true ]; then
            echo "\n📊 Diff size: $original_length characters (under $token_limit limit, using full diff)" >&2
        fi
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