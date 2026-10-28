import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, statSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { AGENT_SETUP_ENTRY_NAMES, TEMPLATE_GITHUB } from './constants.mjs'

const templateRemotePatterns = Object.values(TEMPLATE_GITHUB).flatMap((repo) => [
  `https://github.com/${repo}.git`,
  `https://github.com/${repo}`,
  `git@github.com:${repo}.git`,
])

export const isTemplateRemoteUrl = (url) => {
  const normalized = url.trim().replace(/\/$/u, '')
  return templateRemotePatterns.some((pattern) => normalized === pattern.replace(/\/$/u, ''))
}

// Agent-setup entries (see AGENT_SETUP_ENTRY_NAMES) plus any user-confirmed `preserve`
// names do not make a destination "nonempty": the template is copied around them.
export const assessDestination = ({ destinationPath, allowNonempty = false, preserve = [] }) => {
  if (!destinationPath?.trim()) return { ok: false, reason: 'Destination path is required.' }

  if (!existsSync(destinationPath)) return { ok: true, preserved: [] }

  const keep = new Set([...AGENT_SETUP_ENTRY_NAMES, ...preserve])
  const entries = readdirSync(destinationPath).filter((name) => name !== '.git')
  const preserved = entries.filter((name) => keep.has(name))
  const unexpected = entries.filter((name) => !keep.has(name))
  if (unexpected.length > 0 && !allowNonempty)
    return {
      ok: false,
      reason: `Destination is not empty (${unexpected.join(', ')}). Ask whether to keep these files and bootstrap here, or choose another directory.`,
      unexpected,
    }

  const gitDir = join(destinationPath, '.git')
  if (!existsSync(gitDir)) return { ok: true, preserved }

  try {
    const count = execSync('git rev-list --count HEAD', { cwd: destinationPath, encoding: 'utf8', stdio: 'pipe' }).trim()
    if (Number(count) > 0)
      return { ok: false, reason: 'Destination already has Git history. Never reset or delete an existing project.' }
  } catch {
    return { ok: true, preserved }
  }

  return { ok: true, preserved }
}

// Copies a template checkout into the destination without overwriting anything already
// there, so adopter instruction files and installed skills survive. Skips the template's `.git`.
const pathExists = (path) => {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

export const copyTemplateInto = ({ templateDir, destinationPath }) => {
  const copied = []
  const skipped = []

  const walk = (rel) => {
    for (const entry of readdirSync(join(templateDir, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (!rel && entry.name === '.git') continue
      const target = join(destinationPath, childRel)
      if (entry.isDirectory()) {
        if (existsSync(target) && !statSync(target).isDirectory()) {
          skipped.push(childRel)
          continue
        }
        mkdirSync(target, { recursive: true })
        walk(childRel)
        continue
      }
      // lstat, not existsSync: a dangling link at the destination still counts as present.
      if (pathExists(target)) {
        skipped.push(childRel)
        continue
      }
      // Recreate links as links with the same (usually relative) target; cpSync fails on links to directories.
      if (entry.isSymbolicLink()) symlinkSync(readlinkSync(join(templateDir, childRel)), target)
      else cpSync(join(templateDir, childRel), target)
      copied.push(childRel)
    }
  }

  mkdirSync(destinationPath, { recursive: true })
  walk('')
  return { copied, skipped }
}

export const assertNoTemplateOrigin = ({ remotes }) => {
  const violations = (remotes ?? []).filter((remote) => isTemplateRemoteUrl(remote.url))
  if (violations.length === 0) return { ok: true }
  return {
    ok: false,
    reason: `Remote must not point at a template repository: ${violations.map((r) => r.name).join(', ')}`,
  }
}
