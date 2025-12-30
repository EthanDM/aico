import { PullRequestMessage, PullRequestTemplate } from '../types'

interface ValidationResult {
  valid: boolean
  errors: string[]
}

const TITLE_PATTERN = /^(fix|feat|refactor|chore|perf|docs)\([a-z0-9-]+\):\s+\S+/i
const FILE_PATH_PATTERN = /(src\/|lib\/|packages\/|\.ts\b|\.tsx\b|\.js\b|\.jsx\b|\.json\b|\.md\b)/
const FILEISH_HEADING_PATTERN = /(\.md\b|readme\b|services?\b|constants?\b|cli\b|heuristics?\b|processors?\b|prompts?\b|types?\b|validation\b|tests?\b|config\b|scripts?\b|dist\b|build\b|package\b|tsconfig\b|license\b)/i
const QA_GENERIC_PREFIX = /^(verified|ensured|checked|tested|confirmed)\b/i
const QA_SURFACE_PATTERN = /^[^:]{2,25}:\s+\S+/

export class PullRequestValidator {
  public validate(
    message: PullRequestMessage,
    template: PullRequestTemplate
  ): ValidationResult {
    const errors: string[] = []
    if (!TITLE_PATTERN.test(message.title.trim())) {
      errors.push('Title must match "<type>(<scope>): <outcome>" format')
    }

    const sections = this.parseSections(message.body)
    const summary = sections.get('summary') || ''
    const qaFocus = sections.get('qa focus') || ''

    if (!summary.trim()) {
      errors.push('Missing Summary section')
    }

    if (!qaFocus.trim()) {
      errors.push('Missing QA Focus section')
    }

    if (template === 'default') {
      const extraSections = Array.from(sections.keys()).filter(
        (key) =>
          !['summary', 'changes', 'qa focus', 'notes', 'screenshots'].includes(
            key
          )
      )
      if (extraSections.length > 0) {
        errors.push(
          `Default template should not include grouped sections: ${extraSections.join(
            ', '
          )}`
        )
      }
      const changes = sections.get('changes') || ''
      if (!changes.trim()) {
        errors.push('Missing Changes section')
      } else {
        const changeBullets = this.extractBullets(changes)
        if (changeBullets.length < 2) {
          errors.push('Changes section needs at least 2 bullets')
        }
        if (changeBullets.length > 10) {
          errors.push('Changes section has too many bullets')
        }
        if (this.containsFilePaths(changeBullets)) {
          errors.push('Changes section should not include file paths')
        }
      }
    }

    if (template === 'grouped') {
      const groupSections = Array.from(sections.keys()).filter(
        (key) =>
          !['summary', 'qa focus', 'notes', 'screenshots'].includes(key)
      )
      if (groupSections.length < 2) {
        errors.push('Grouped template needs at least 2 group sections')
      }
      for (const key of groupSections) {
        if (this.isFileishHeading(key)) {
          errors.push(`Group heading "${key}" looks like file or infra`)
        }
        const bullets = this.extractBullets(sections.get(key) || '')
        if (bullets.length === 0) {
          errors.push(`Group "${key}" should include bullets`)
        }
        if (bullets.length > 6) {
          errors.push(`Group "${key}" has too many bullets`)
        }
        if (this.containsFilePaths(bullets)) {
          errors.push(`Group "${key}" should not include file paths`)
        }
      }
    }

    if (template === 'subtle-bug') {
      const rootCause = sections.get('root cause') || ''
      const fix = sections.get('fix') || ''
      if (!rootCause.trim()) {
        errors.push('Missing Root cause section')
      }
      if (!fix.trim()) {
        errors.push('Missing Fix section')
      }
      const rootBullets = this.extractBullets(rootCause)
      const fixBullets = this.extractBullets(fix)
      if (rootBullets.length > 3) {
        errors.push('Root cause has too many bullets')
      }
      if (fixBullets.length > 3) {
        errors.push('Fix has too many bullets')
      }
      if (this.containsFilePaths(rootBullets) || this.containsFilePaths(fixBullets)) {
        errors.push('Root cause/Fix should not include file paths')
      }
    }

    const qaBullets = this.extractBullets(qaFocus)
    const notTested =
      qaBullets.length === 1 &&
      qaBullets[0].toLowerCase() === 'not tested (not run)'
    if (qaBullets.length < 2 && !notTested) {
      errors.push('QA Focus should include at least 2 bullets')
    }
    if (qaBullets.length > 10) {
      errors.push('QA Focus has too many bullets')
    }
    if (this.containsFilePaths(qaBullets)) {
      errors.push('QA Focus should not include file paths')
    }
    if (qaBullets.some((bullet) => QA_GENERIC_PREFIX.test(bullet))) {
      errors.push('QA Focus bullets should be executable, not generic')
    }
    if (
      !notTested &&
      !qaBullets.some((bullet) => QA_SURFACE_PATTERN.test(bullet))
    ) {
      errors.push('QA Focus bullets should start with a surface like "CLI: ..."')
    }

    return { valid: errors.length === 0, errors }
  }

  private parseSections(body: string): Map<string, string> {
    const sections = new Map<string, string>()
    const lines = body.split('\n')
    let currentKey: string | undefined
    let buffer: string[] = []

    const flush = () => {
      if (currentKey) {
        sections.set(currentKey, buffer.join('\n').trim())
      }
      buffer = []
    }

    for (const line of lines) {
      const match = line.match(/^###\s+(.+)$/)
      if (match) {
        flush()
        currentKey = match[1].trim().toLowerCase()
        continue
      }
      buffer.push(line)
    }

    flush()
    return sections
  }

  private extractBullets(sectionText: string): string[] {
    return sectionText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.replace(/^- /, '').trim())
      .filter(Boolean)
  }

  private containsFilePaths(lines: string[]): boolean {
    return lines.some((line) => FILE_PATH_PATTERN.test(line))
  }

  private isFileishHeading(heading: string): boolean {
    const normalized = heading.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (FILEISH_HEADING_PATTERN.test(heading)) {
      return true
    }
    return FILEISH_HEADING_PATTERN.test(normalized)
  }
}
