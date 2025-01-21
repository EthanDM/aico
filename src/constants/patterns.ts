/**
 * Patterns for files that typically add noise to diffs.
 */
export const NOISY_FILE_PATTERNS = [
  // Package managers and dependencies
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^.*\.lock$/,
  // Build outputs
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^node_modules\//,
  // Generated files
  /\.min\.(js|css)$/,
  /\.bundle\.js$/,
  /\.generated\./,
  // Environment and config
  /^\.env/,
  /\.DS_Store$/,
]
