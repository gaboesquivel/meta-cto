import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isForbiddenInstructionPath } from './identity.mjs'
import { STALE_SCAN_PRESERVE_REL_PATHS, STALE_SCAN_SKIP_DIR_NAMES } from './constants.mjs'

const flowNextRelPaths = [
  'package.json',
  'README.md',
  'next.config.ts',
  'app/layout.tsx',
  'app/api/route.ts',
  'app/api/operator/chat/route.ts',
  'lib/mcp/create-mcp-server.ts',
  'lib/mcp/create-operator-mcp-server.ts',
  'lib/mcp/register-tools.ts',
  'lib/mcp/register-operator-tools.ts',
  'lib/mcp/tool-catalog.ts',
  'lib/openapi/build-openapi-document.ts',
  'lib/starter-content.ts',
  'tests/mcp/route.test.ts',
  'tests/mcp/operator-isolation.test.ts',
  'tests/operator/access.test.ts',
]

const flowMonoRelPaths = [
  'package.json',
  'README.md',
  'apps/web/package.json',
  'apps/web/next.config.ts',
  'apps/web/app/layout.tsx',
  'apps/web/app/api/operator/chat/route.ts',
  'apps/web/app/llms.txt/route.ts',
  'apps/web/lib/mcp/create-mcp-server.ts',
  'apps/web/lib/mcp/create-operator-mcp-server.ts',
  'apps/web/lib/mcp/register-tools.ts',
  'apps/web/lib/mcp/register-operator-tools.ts',
  'apps/web/lib/mcp/tool-catalog.ts',
  'apps/web/lib/starter-content.ts',
  'apps/web/tests/mcp/route.test.ts',
  'apps/web/tests/mcp/operator.test.ts',
  'apps/web/tests/operator/access.test.ts',
  'apps/web/tests/starter.contract.test.ts',
]

export const renameAllowlistForTemplate = (template) =>
  template === 'flow-mono' ? flowMonoRelPaths : flowNextRelPaths

const buildReplacements = ({ template, identity }) => {
  const { slug, displayTitle, mcpTitle, apiTitle, portlessHost } = identity
  if (template === 'flow-next')
    return [
      ['flow-next-operator-mcp', `${slug}-operator-mcp`],
      ['flow-next-operator', `${slug}-operator`],
      ['flow-next-mcp', `${slug}-mcp`],
      ['flow-next.localhost', portlessHost],
      ['*.flow-next.localhost', `*.${portlessHost}`],
      ['Flow Next API', apiTitle],
      ['Flow Next MCP', mcpTitle],
      ['Flow Next', displayTitle],
      ['flow-next', slug],
    ]

  return [
    ['flow-mono-operator-mcp', `${slug}-operator-mcp`],
    ['flow-mono-operator', `${slug}-operator`],
    ['flow-mono-mcp', `${slug}-mcp`],
    ['Flow Mono MCP', mcpTitle],
    ['Flow Mono', displayTitle],
    ['flow-mono', slug],
    ['*.app.localhost', `*.${portlessHost}`],
    ['app.localhost', portlessHost],
    ['Flow Next deployment', `${displayTitle} deployment`],
    ['Flow Next', displayTitle],
  ]
}

export const applyTemplateRenamesToText = ({ template, identity, text }) => {
  let out = text
  for (const [from, to] of buildReplacements({ template, identity })) out = out.split(from).join(to)
  return out
}

export const renamePackageJsonPortless = ({ template, identity, packageJsonText }) => {
  const parsed = JSON.parse(packageJsonText)
  parsed.name = template === 'flow-mono' && parsed.name === 'web' ? 'web' : identity.packageName
  if (parsed.portless?.name) parsed.portless.name = identity.slug
  return `${JSON.stringify(parsed, null, 2)}\n`
}

export const applyRenameToFile = ({ template, identity, relativePath, content }) => {
  if (isForbiddenInstructionPath(relativePath)) return { ok: false, reason: 'Instruction file edits are forbidden.' }

  if (relativePath.endsWith('package.json'))
    return { ok: true, content: renamePackageJsonPortless({ template, identity, packageJsonText: content }) }

  return { ok: true, content: applyTemplateRenamesToText({ template, identity, text: content }) }
}

export const applyRenamesInTree = ({ root, template, identity }) => {
  const allowlist = new Set(renameAllowlistForTemplate(template))
  const updated = []

  for (const rel of allowlist) {
    const abs = join(root, rel)
    if (!statSync(abs, { throwIfNoEntry: false })?.isFile()) continue
    const content = readFileSync(abs, 'utf8')
    const result = applyRenameToFile({ template, identity, relativePath: rel, content })
    if (!result.ok) return result
    writeFileSync(abs, result.content, 'utf8')
    updated.push(rel)
  }

  return { ok: true, updated }
}

const stalePatternsForTemplate = (template) =>
  template === 'flow-mono'
    ? [/flow-mono/iu, /Flow Mono/u, /\bapp\.localhost\b/u]
    : [/flow-next/iu, /Flow Next/u, /flow-next\.localhost/u]

export const findStaleTemplateReferencesInText = ({ template, text, relativePath }) => {
  if (STALE_SCAN_PRESERVE_REL_PATHS.has(relativePath.replace(/\\/gu, '/'))) return []
  return stalePatternsForTemplate(template)
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source)
}

export const scanTreeForStaleIdentifiers = ({ root, template }) => {
  const issues = []

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (STALE_SCAN_SKIP_DIR_NAMES.has(entry.name)) continue
      const abs = join(dir, entry.name)
      const rel = relative(root, abs).replace(/\\/gu, '/')
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (!/\.(md|ts|tsx|json|mjs|js|yml|yaml|example)$/iu.test(entry.name)) continue
      const text = readFileSync(abs, 'utf8')
      const hits = findStaleTemplateReferencesInText({ template, text, relativePath: rel })
      if (hits.length) issues.push({ path: rel, patterns: hits })
    }
  }

  walk(root)
  return issues
}
