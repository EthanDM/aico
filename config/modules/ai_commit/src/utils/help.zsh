#!/usr/bin/env zsh

#
# help.zsh - Help Documentation for AI Commit
#
# This module provides help documentation and usage information
# for the AI Commit feature.
#

# Help function for ai_commit
function ai_commit_help() {
    echo "Usage: commit [-d] [-l] [-s] [-a] [-v] [-p] [-h]"
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
    echo "Commit Message Format:"
    echo "  1. Subject Line (required)"
    echo "     <type>(<scope>): <description>"
    echo "     - Types: feat|fix|docs|style|refactor|test|chore"
    echo "     - Scope: optional, e.g., (ui), (api), (auth)"
    echo "     - Description: imperative mood, no period"
    echo ""
    echo "  2. Message Body (if needed)"
    echo "     - Explains what and why (not how)"
    echo "     - Uses bullet points for multiple items"
    echo "     - Wrapped at 72 characters"
    echo ""
    echo "  3. Footer (if applicable)"
    echo "     - BREAKING CHANGE: <description>"
    echo "     - Closes #123, Fixes #456"
    echo ""
    echo "Examples:"
    echo "  feat(auth): add OAuth2 support for Google login"
    echo ""
    echo "  - Implements OAuth2 flow for Google authentication"
    echo "  - Adds secure token storage and refresh mechanism"
    echo "  - Includes automatic session management"
    echo ""
    echo "  Closes #123"
    echo ""
    echo "Smart Diff Filtering:"
    echo "  - Excludes noise from lock files, build artifacts, etc."
    echo "  - Use -v to see all changes including filtered files"
    echo "  - Use clean-diff to preview what the AI will see"
} 