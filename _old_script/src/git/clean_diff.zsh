# Function to filter and clean diff output
function clean_diff() {
    local diff_text=$1
    local files=$2
    local is_verbose=$3
    
    # Files to exclude from detailed diff (but still mention in summary)
    local noisy_files=(
        # Package managers and dependencies
        'package-lock.json'
        'yarn.lock'
        'pnpm-lock.yaml'
        'Podfile.lock'
        'Cargo.lock'
        'poetry.lock'
        'Gemfile.lock'
        'composer.lock'
        'mix.lock'
        '.pnp.js'
        '.yarn/install-state.gz'
        'yarn-error.log*'
        'pnpm-debug.log*'
        'lerna-debug.log*'
        
        # Mobile & React Native specific
        'ios/Pods/*'
        'ios/build/*'
        'ios/DerivedData/*'
        'ios/xcuserdata/*'
        'ios/device-support/*'
        'ios/.xcode.env.local'
        '*.xccheckout'
        '*.moved-aside'
        '*.hmap'
        '*.ipa'
        '*.xcuserstate'
        '*.dSYM'
        '*.jks'
        '*.p8'
        '*.p12'
        '*.key'
        '*.mobileprovision'
        '*.orig.*'
        'android/app/build/*'
        'android/build/*'
        'android/gradle*'
        'android/.gradle/*'
        'android/.cxx/*'
        'android/local.properties'
        '*.hprof'
        '*.keystore'
        '*.pbxproj'
        '*.xcworkspace/*'
        '*.xcodeproj/*'
        'web-build/*'
        '.metro-health-check*'
        
        # Build and cache directories
        'dist/*'
        'dist-ssr/*'
        'build/*'
        '.next/*'
        '.nuxt/*'
        'node_modules/*'
        'vendor/*'
        'tmp/*'
        'coverage/*'
        '.expo/*'
        '/out/*'
        '/.pnp/*'
        'jest-cache/*'
        'jest-config/*'
        
        # Minified/Generated/Bundle files
        '*.min.js'
        '*.min.css'
        '*.bundle.js'
        '*.chunk.js'
        '*.generated.*'
        '*.jsbundle'
        '*.bundle'
        '*.tsbuildinfo'
        'next-env.d.ts'
        
        # Environment and config
        '.env'
        '.env.*'
        '!.env.example'
        '.env*.local'
        './config/*.json'
        'config/cache/*.json'
        'config/generated/*.json'
        '.DS_Store'
        '.idea/*'
        '.vscode/*'
        '!.vscode/extensions.json'
        'newrelic_agent.log'
        'dump.rdb'
        
        # Logs and debug files
        'logs/*'
        '*.log'
        'npm-debug.log*'
        'yarn-debug.log*'
        'yarn-error.log*'
        '*.tmp'
        
        # Test and coverage
        '/coverage/*'
        '/cypress/videos/*'
        '/cypress/screenshots/*'
        '**/fastlane/report.xml'
        '**/fastlane/Preview.html'
        '**/fastlane/screenshots'
        '**/fastlane/test_output'
        
        # Framework specific
        'public/assets/*'
        'public/build/*'
        'public/js/*'
        'public/css/*'
        'resources/assets/build/*'
        'storage/*.key'
        
        # Editor files
        '*.suo'
        '*.ntvs*'
        '*.njsproj'
        '*.sln'
        '*.sw?'
        '*.iml'
    )
    
    # Initialize clean diff
    local clean_diff=""
    local excluded_files=""
    
    # Process each changed file
    while IFS= read -r file; do
        local skip_diff=false
        
        # Check if file matches any noisy pattern
        for pattern in "${noisy_files[@]}"; do
            # Skip empty patterns
            if [ -z "$pattern" ]; then
                continue
            fi
            
            # Convert glob pattern to regex, being more precise with special characters
            local regex_pattern="${pattern//\*/[^/]*}"  # Replace * with [^/]* to not match across directories
            regex_pattern="${regex_pattern//\?/[^/]}"   # Replace ? with [^/] for single char
            regex_pattern="^${regex_pattern}$"          # Anchor to start and end
            
            if [[ $file =~ $regex_pattern ]]; then
                if [ "$debug" = true ]; then
                    echo "  ✗ File '$file' matched noisy pattern: '$pattern'"
                fi
                if [ "$is_verbose" = false ]; then
                    excluded_files+="$file "
                    skip_diff=true
                    break
                fi
            fi
        done
        
        if [ "$skip_diff" = false ]; then
            # Extract diff for this file
            local file_diff=$(echo "$diff_text" | awk -v file="$file" '
                $0 ~ "^diff --git.*"file {
                    p=1
                    print
                    next
                }
                p && $0 ~ "^diff --git" {
                    p=0
                }
                p { print }
            ')
            
            # Clean up the diff
            if [ ! -z "$file_diff" ]; then
                # Remove noisy lines from the diff
                file_diff=$(echo "$file_diff" | grep -v '^index ' | grep -v '^old mode ' | grep -v '^new mode ')
                clean_diff+="$file_diff\n"
            fi
        fi
    done < <(echo "$files" | tr ' ' '\n')
    
    # Add summary of excluded files if any
    if [ ! -z "$excluded_files" ]; then
        clean_diff="# Note: Excluding detailed diffs from: $excluded_files\n$clean_diff"
    fi
    
    echo "$clean_diff"
}

# Function to show cleaned diff output
function show_clean_diff() {
    local verbose=false
    local debug=false
    local OPTIND
    while getopts "vd" opt; do
        case $opt in
            v) verbose=true ;;  # Show full diff including filtered files
            d) debug=true ;;   # Show debug info about file matching
        esac
    done
    shift $((OPTIND-1))

    # Get the diff and files
    local raw_files=""
    local changed_files=""
    local diff_output=""
    
    if [ ! -z "$(command git diff --staged --name-only)" ]; then
        raw_files=$(command git diff --staged --name-only)
        changed_files=$(echo "$raw_files" | paste -sd " " -)
        diff_output=$(command git diff --staged)
        echo "📦 Showing cleaned diff for staged changes:"
    else
        raw_files=$(command git diff --name-only)
        changed_files=$(echo "$raw_files" | paste -sd " " -)
        diff_output=$(command git diff)
        echo "📝 Showing cleaned diff for unstaged changes:"
    fi

    echo "\n🔍 Changed files:"
    echo "$changed_files"
    
    if [ "$debug" = true ]; then
        echo "\n🐛 Debug: Pattern matching results:"
        while IFS= read -r file; do
            echo "\nChecking $file:"
            for pattern in "${noisy_files[@]}"; do
                if [[ $file =~ ${pattern//\*/.*} ]]; then
                    echo "  ✗ Matched noisy pattern: $pattern"
                fi
            done
        done < <(echo "$changed_files" | tr ' ' '\n')
    fi
    
    echo "\n📄 Cleaned diff output:"
    clean_diff "$diff_output" "$changed_files" "$verbose"
}

# Alias for showing clean diff
alias clean-diff='show_clean_diff' 