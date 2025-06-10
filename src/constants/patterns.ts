/**
 * Patterns for files that typically add noise to diffs.
 */
export const NOISY_FILE_PATTERNS = [
  // Package managers and dependencies
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^.*\.lock$/,
  /^composer\.lock$/,
  /^Pipfile\.lock$/,
  /^poetry\.lock$/,

  // Build outputs and compiled files
  /^dist\//,
  /^build\//,
  /^out\//,
  /^\.next\//,
  /^\.nuxt\//,
  /^node_modules\//,
  /^vendor\//,
  /^target\//,
  /^bin\//,

  // Generated and minified files
  /\.min\.(js|css)$/,
  /\.bundle\.js$/,
  /\.chunk\.js$/,
  /\.generated\./,
  /\.auto-generated/,
  /^.*-generated\./,

  // Environment and config (often auto-generated or sensitive)
  /^\.env/,
  /\.DS_Store$/,
  /^Thumbs\.db$/,
  /^desktop\.ini$/,

  // IDE and editor files
  /^\.vscode\//,
  /^\.idea\//,
  /^\.sublime-/,
  /\.swp$/,
  /\.swo$/,
  /~$/,

  // Version control and git
  /^\.git\//,
  /^\.gitignore$/,
  /^\.gitkeep$/,

  // Log files and temporary files
  /\.log$/,
  /\.tmp$/,
  /\.temp$/,
  /^tmp\//,
  /^logs?\//,

  // Coverage and test output
  /^coverage\//,
  /^\.nyc_output\//,
  /^test-results\//,
  /^\.pytest_cache\//,

  // Documentation that's often auto-generated
  /^docs?\/api\//,
  /^CHANGELOG/,
  /^HISTORY/,
]
