# Function to handle smart diff extraction
function smart_diff() {
    local diff_output=$1
    local token_limit=$2
    local debug=$3
    local verbose=$4
    
    echo "\n📝 Large changes detected, extracting key information..." >&2
    
    # First create a summary section
    local summary=""
    
    # Extract file operations with proper escaping
    local file_ops=$(printf '%s' "$diff_output" | grep -a -E '^diff --git|^new file|^deleted file|^rename|^similarity index|^copy from|^copy to|^index' | \
        grep -v '^index [0-9a-f]' | \
        perl -pe 's/[\x00-\x1F\x7F-\xFF]/./g' | \
        sed 's/\\/\\\\/g' | \
        sed 's/"/\\"/g')
    
    # Extract function/class changes with proper escaping
    local func_changes=$(printf '%s' "$diff_output" | grep -a -E '^\+.*\b(function|class|def|interface|enum|struct|module)\b' | \
        head -n 20 | \
        perl -pe 's/[\x00-\x1F\x7F-\xFF]/./g' | \
        sed 's/\\/\\\\/g' | \
        sed 's/"/\\"/g')
    
    # Extract dependency changes with proper escaping
    local dep_changes=$(printf '%s' "$diff_output" | grep -a -E '^\+.*("dependencies"|"devDependencies"|"peerDependencies"|"version"|pod |gem |import |require |use |from )' | \
        head -n 20 | \
        perl -pe 's/[\x00-\x1F\x7F-\xFF]/./g' | \
        sed 's/\\/\\\\/g' | \
        sed 's/"/\\"/g')
    
    # Extract significant changes with proper escaping
    local additions=$(printf '%s' "$diff_output" | grep -a -E '^\+[^+\s]' | \
        grep -Ev '^\+\s*(\/\/|\*|#|$)' | \
        grep -Ev '^\+.*(function|class|def|interface|enum|struct|module)\b' | \
        head -n 40 | \
        perl -pe 's/[\x00-\x1F\x7F-\xFF]/./g' | \
        sed 's/\\/\\\\/g' | \
        sed 's/"/\\"/g')
    
    local deletions=$(printf '%s' "$diff_output" | grep -a -E '^\-[^-\s]' | \
        grep -Ev '^\-\s*(\/\/|\*|#|$)' | \
        grep -Ev '^\-.*(function|class|def|interface|enum|struct|module)\b' | \
        head -n 20 | \
        perl -pe 's/[\x00-\x1F\x7F-\xFF]/./g' | \
        sed 's/\\/\\\\/g' | \
        sed 's/"/\\"/g')
    
    # Build the summary section
    if [ ! -z "$file_ops" ]; then
        summary+="=== File Operations ===\n$file_ops\n\n"
    fi
    
    if [ ! -z "$func_changes" ]; then
        summary+="=== Function Changes ===\n$func_changes\n\n"
    fi
    
    if [ ! -z "$dep_changes" ]; then
        summary+="=== Dependency Changes ===\n$dep_changes\n\n"
    fi
    
    if [ ! -z "$additions" ]; then
        summary+="=== Other Significant Additions ===\n$additions\n\n"
    fi
    
    if [ ! -z "$deletions" ]; then
        summary+="=== Other Significant Deletions ===\n$deletions\n\n"
    fi
    
    # Now add additional context up to the token limit
    local summary_length=${#summary}
    local remaining_space=$((token_limit - summary_length))
    
    if [ $remaining_space -gt 1000 ]; then  # Only add context if we have reasonable space
        local context=$(printf '%s' "$diff_output" | \
            perl -pe 's/[\x00-\x1F\x7F-\xFF]/./g' | \
            sed 's/\\/\\\\/g' | \
            sed 's/"/\\"/g' | \
            head -c $remaining_space)
        
        if [ ! -z "$context" ]; then
            summary+="\n=== Additional Context ===\n$context"
        fi
    fi
    
    # Show debug info if requested
    if [ "$debug" = true ] || [ "$verbose" = true ]; then
        local summary_length=${#summary}
        echo "\n📊 Diff handling:" >&2
        echo "  Original length: ${#diff_output} characters" >&2
        echo "  Summary length: $summary_length characters" >&2
        echo "  Token limit: $token_limit characters" >&2
        if [ $remaining_space -gt 1000 ]; then
            echo "  Added ${#context} characters of additional context" >&2
        fi
        
        if [ "$debug" = true ]; then
            echo "\n🔍 Smart diff content:" >&2
            echo "$summary" | sed 's/\\n/\n/g' | sed 's/\\\\/\\/g' | sed 's/\\"/"/g' >&2
        fi
    fi
    
    # Final escaping for API request
    echo "$summary" | tr '\n' ' ' | sed 's/\\/\\\\/g' | sed 's/"/\\"/g'
} 