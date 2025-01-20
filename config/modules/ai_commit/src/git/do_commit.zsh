# Function to handle commit action
function do_commit() {
    local msg=$1
    local should_stage=$2
    
    if [ "$should_stage" = true ]; then
        command git add .
    fi
    
    if command git commit -m "$msg"; then
        echo "✅ Changes committed successfully"
        # Show push reminder if there are unpushed commits
        local unpushed=$(command git log @{u}.. 2>/dev/null)
        if [ ! -z "$unpushed" ]; then
            echo "📤 Tip: Use 'git push' to push your changes"
        fi
        return 0
    else
        echo "❌ Commit failed"
        return 1
    fi
} 