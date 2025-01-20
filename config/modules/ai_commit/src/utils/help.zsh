#!/usr/bin/env zsh

#
# help.zsh - Help Documentation for AI Commit
#
# This module provides help documentation and usage information
# for the AI Commit feature.
#

# Help function for ai_commit
function ai_commit_help() {
    echo "Usage: commit [-d] [-s] [-a] [-v] [-p] [-l] [-h]"
    echo ""
    echo "AI-powered git commit message generator"
    echo ""
    echo "Options:"
    echo "  -d    Debug mode - show detailed debug information"
    echo "  -l    Log API responses only (less verbose than debug)"
    echo "  -s    Auto-stage all changes"
    echo "  -a    Auto-accept generated message (must have changes staged)"
    echo "  -v    Verbose mode - show full diff"
    echo "  -p    Use GPT-4o for enhanced responses (default: GPT-4o-mini)"
    echo "  -h    Show this help message"
    echo ""
    echo "Quick Actions (no Enter needed):"
    echo "  A     Accept and commit"
    echo "  E     Edit message"
    echo "  R     Regenerate message"
    echo "  S     Stage all & commit"
    echo "  V     View full diff"
    echo "  D     Toggle debug output"
    echo "  C     Cancel"
    echo ""
    echo "Examples:"
    echo "  commit             # Interactive commit with GPT-4o-mini"
    echo "  commit -p          # Use GPT-4o for better analysis"
    echo "  commit -sp         # Stage all and use GPT-4o"
    echo "  commit -sa         # Stage and auto-commit"
    echo "  commit -v          # Show full diff"
    echo "  commit -l          # Show API responses only"
    echo "  commit -d          # Show all debug information"
    echo ""
    echo "Debug Levels:"
    echo "  -l    API responses only (clean JSON output)"
    echo "  -d    Full debug info (API, diff processing, errors)"
    echo ""
    echo "Smart Diff Filtering:"
    echo "  - Excludes noise from lock files, build artifacts, etc."
    echo "  - Use -v to see all changes including filtered files"
    echo "  - Use clean-diff to preview what the AI will see"
} 