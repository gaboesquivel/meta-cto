import { FORBIDDEN_INSTRUCTION_BASENAMES, TEMPLATE_HINTS } from './constants.mjs'

const SLUG_PATTERN = /^[a-z][a-z0-9-]{0,62}$/u

const toSlug = (projectName) => {
  const normalized = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-{2,}/gu, '-')
  if (!normalized || !SLUG_PATTERN.test(normalized)) return
  return normalized
}

export const deriveProjectIdentity = ({ projectName }) => {
  const displayTitle = projectName.trim()
  if (!displayTitle) return { ok: false, reason: 'Project name is required.' }

  const slug = toSlug(displayTitle)
  if (!slug) return { ok: false, reason: 'Project name must normalize to a hostname-safe slug (letters, numbers, hyphens).' }

  const titleFromSlug = slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return {
    ok: true,
    identity: {
      slug,
      packageName: slug,
      portlessHost: `${slug}.localhost`,
      displayTitle,
      mcpTitle: `${titleFromSlug} MCP`,
      apiTitle: `${titleFromSlug} API`,
    },
  }
}

export const isForbiddenInstructionPath = (relativePath) =>
  FORBIDDEN_INSTRUCTION_BASENAMES.has(relativePath.split('/').pop() ?? '')

// Picks the template the invocation already names ("nextjs app", "turborepo", a template URL).
// flow-mono hints win so "Next.js monorepo" resolves to flow-mono. Returns undefined when unclear.
export const inferTemplateFromRequest = (request) => {
  if (!request?.trim()) return
  return ['flow-mono', 'flow-next'].find((template) => TEMPLATE_HINTS[template].some((hint) => hint.test(request)))
}
