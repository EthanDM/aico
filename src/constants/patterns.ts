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
  /^Podfile\.lock$/,
  /^Gemfile\.lock$/,

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

  // React Native iOS build outputs
  /^ios\/build\//,
  /^ios\/Pods\//,
  /^ios\/.*\.xcworkspace\//,
  /^ios\/.*\.xcodeproj\/project\.xcworkspace\//,
  /^ios\/.*\.xcodeproj\/xcuserdata\//,
  /^ios\/DerivedData\//,
  /^ios\/.*\.dSYM\//,
  /\.ipa$/,

  // React Native Android build outputs
  /^android\/build\//,
  /^android\/app\/build\//,
  /^android\/\.gradle\//,
  /^android\/gradle\//,
  /^android\/local\.properties$/,
  /^android\/.*\.iml$/,
  /^android\/.*\/build\//,
  /\.apk$/,
  /\.aab$/,

  // Expo and React Native tooling
  /^\.expo\//,
  /^\.expo-shared\//,
  /^web-build\//,
  /^expo-env\.d\.ts$/,

  // Mobile development certificates and provisioning
  /\.mobileprovision$/,
  /\.p12$/,
  /\.keystore$/,
  /\.jks$/,

  // Modern build tools and caches
  /^\.turbo\//,
  /^\.nx\//,
  /^\.rush\//,
  /^\.yarn\//,
  /^\.pnp\.*$/,
  /^\.cache\//,
  /^\.parcel-cache\//,
  /^\.swc\//,

  // Generated and minified files
  /\.min\.(js|css)$/,
  /\.bundle\.js$/,
  /\.chunk\.js$/,
  /\.generated\./,
  /\.auto-generated/,
  /^.*-generated\./,
  /\.(js|css)\.map$/,

  // Environment and config (often auto-generated or sensitive)
  /^\.env(?!\.example)/,
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
  /^\.fleet\//,

  // Version control and git
  /^\.git\//,

  // Log files and temporary files
  /\.log$/,
  /\.tmp$/,
  /\.temp$/,
  /^tmp\//,
  /^logs?\//,
  /^\.logs\//,

  // Coverage and test output
  /^coverage\//,
  /^\.nyc_output\//,
  /^test-results\//,
  /^\.pytest_cache\//,
  /^junit\.xml$/,
  /^test-report\./,

  // Cloud and deployment artifacts
  /^\.vercel\//,
  /^\.netlify\//,
  /^\.firebase\//,
  /^\.gcloud\//,
  /^\.serverless\//,

  // Documentation that's often auto-generated
  /^docs?\/api\//,
  /^CHANGELOG/,
  /^HISTORY/,
  /^storybook-static\//,

  // WebAssembly and native builds
  /\.wasm$/,
  /\.so$/,
  /\.dylib$/,
  /\.dll$/,

  // Fastlane and CI/CD outputs
  /^fastlane\/report\.xml$/,
  /^fastlane\/Preview\.html$/,
  /^fastlane\/screenshots\//,
  /^fastlane\/test_output\//,

  // Bundle and deployment files
  /^\.bundle\//,
  /^public\/build\//,
  /^static\/build\//,
]
