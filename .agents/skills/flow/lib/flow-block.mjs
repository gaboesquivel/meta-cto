// Idempotent writer for the project Flow block (decision 0020) and the instruction-file layout (spec 021).
// Usage: node flow-block.mjs <project-dir> [local|github]
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BEGIN = '<!-- BEGIN FLOW -->'
export const END = '<!-- END FLOW -->'
export const DELIVERY_MODES = ['github', 'local']
// Legacy values from before decision 0037 read as github; the next block write records github.
const LEGACY_GITHUB = ['pull-request', 'pull-requests', 'pullrequest', 'pr']

// The one phrase table; docs link here and tests check each phrase against its skill's description.
export const PHRASES = [
  ['"explore this"', 'explore'],
  ['"interview me"', 'interview'],
  ['"grill this"', 'grill'],
  ['"spec it"', 'to-spec'],
  ['"share the draft"', 'to-spec'],
  ['"break it down"', 'to-tasks'],
  ['"build it"', 'build'],
  ['"check it against the spec"', 'review'],
  ['"ship it" (add "local" or "with GitHub" for one run)', 'ship'],
  ['"update the docs"', 'flow'],
]

const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n')

export function normalizeDelivery(value) {
  const mode = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/gu, '-')
  if (LEGACY_GITHUB.includes(mode)) return 'github'
  return DELIVERY_MODES.includes(mode) ? mode : null
}

// A Markdown table with padded cells and a dash separator as wide as each column, the shape oxfmt and Prettier write.
// rows[0] is the header; returns one string per line.
export function alignTable(rows) {
  const widths = rows[0].map((_, col) => Math.max(3, ...rows.map((row) => row[col].length)))
  const line = (cells) => `| ${cells.join(' | ')} |`
  const pad = (row) => line(row.map((cell, col) => cell.padEnd(widths[col])))
  return [pad(rows[0]), line(widths.map((width) => '-'.repeat(width))), ...rows.slice(1).map(pad)]
}

// A block's comparable form: table cells trimmed, separator cells reduced to `---`, trailing spaces and blank lines dropped,
// so a formatter's re-spacing reads as no change while any changed word does not.
export function canonicalBlock(block) {
  return block
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      if (!line.trimStart().startsWith('|')) return line
      const cells = line.trim().replace(/^\||\|$/gu, '').split('|').map((cell) => cell.trim().replace(/ {2,}/gu, ' '))
      return `|${cells.map((cell) => (/^:?-+:?$/u.test(cell) ? '---' : cell)).join('|')}|`
    })
    .join('\n')
}

export function buildFlowBlock({ delivery, eol = '\n' } = {}) {
  return [
    BEGIN,
    '',
    '## Flow',
    '',
    'This project uses Flow skills. Say a phrase to load its skill; the installed `flow` skill describes this block. Delete the block to opt out.',
    '',
    `Delivery: ${normalizeDelivery(delivery) ?? 'unset'}`,
    '',
    ...alignTable([['Say', 'Skill'], ...PHRASES.map(([say, skill]) => [say, `\`${skill}\``])]),
    '',
    END,
  ].join(eol)
}

// Offsets of each marker that sits outside fenced code blocks.
function markerOffsets(text, marker) {
  const offsets = []
  let fence = null
  let offset = 0
  for (const line of text.split('\n')) {
    const open = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null
    } else if (open) fence = open[1]
    else {
      const at = line.indexOf(marker)
      if (at !== -1) offsets.push(offset + at)
    }
    offset += line.length + 1
  }
  return offsets
}

function locate(text) {
  const begins = markerOffsets(text, BEGIN)
  const ends = markerOffsets(text, END)
  if (begins.length === 0 && ends.length === 0) return null
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) throw new Error('Malformed Flow block markers; fix them by hand before re-running.')
  return { start: begins[0], end: ends[0] + END.length }
}

function readLine(text, name) {
  const at = locate(text)
  if (!at) return null
  return new RegExp(`^${name}:[ \\t]*(.*)$`, 'imu').exec(text.slice(at.start, at.end))?.[1] ?? null
}

// Return the recorded value, or null when the block is missing or unset.
export const readDelivery = (text) => normalizeDelivery(readLine(text, 'Delivery'))

// Replaces the block in place (unless only its spacing differs) or appends it; text outside the markers is preserved byte for byte.
// Retired lines (`Deploy:`, decision 0028; `Process:`, decision 0036) are dropped because the block is rebuilt from its known lines.
export function upsertFlowBlock(text, { delivery } = {}) {
  const eol = eolOf(text)
  const block = buildFlowBlock({ delivery: normalizeDelivery(delivery) ?? readDelivery(text), eol })
  const at = locate(text)
  // A block that differs only in spacing (for example after the project's formatter ran) is left as it is.
  if (at) return canonicalBlock(text.slice(at.start, at.end)) === canonicalBlock(block) ? text : text.slice(0, at.start) + block + text.slice(at.end)
  if (!text) return `${block}${eol}`
  return `${text}${text.endsWith('\n') ? '' : eol}${eol}${block}${eol}`
}

// Removes the block and the line ending that follows it; text outside the markers is preserved.
export function removeFlowBlock(text) {
  const at = locate(text)
  if (!at) return text
  const tail = text.slice(at.end)
  const eol = tail.startsWith('\r\n') ? 2 : tail.startsWith('\n') ? 1 : 0
  const before = text.slice(0, at.start)
  const after = tail.slice(eol)
  // Removing the block must not leave a doubled blank line where it stood.
  return /\r?\n\r?\n$/u.test(before) && /^\r?\n/u.test(after) ? before + after.replace(/^\r?\n/u, '') : before + after
}

// Exit status of `git <args>` in the project; 128 when it is not a Git work tree.
const git = (projectDir, ...args) => spawnSync('git', args, { cwd: projectDir, stdio: 'ignore' }).status
const isIgnored = (projectDir, name) => git(projectDir, 'check-ignore', '-q', name) === 0
const IMPORT = '@AGENTS.md'
// The one import pattern: a line starting with `@path`.
const IMPORT_LINE = /^[ \t]*@(\S+)/gmu
const importsOf = (text) => [...text.matchAll(IMPORT_LINE)].map((m) => `@${m[1]}`)

const sameFile = (a, b) => {
  if (!existsSync(a) || !existsSync(b)) return false
  const [x, y] = [statSync(a), statSync(b)]
  return x.dev === y.dev && x.ino === y.ino
}

// Why writing `name` in the project is unsafe, or null: a symlink, a path that resolves outside the project,
// or (for CLAUDE.md) CLAUDE.md and AGENTS.md being one file.
export function unsafeWrite(projectDir, name) {
  const file = join(projectDir, name)
  let link
  try {
    link = lstatSync(file).isSymbolicLink()
  } catch {
    return null
  }
  if (link) return `${name} is a symlink`
  const root = realpathSync(projectDir)
  const real = realpathSync(file)
  if (real !== root && !real.startsWith(root + sep)) return `${name} resolves outside the project`
  if (name === 'CLAUDE.md' && sameFile(join(projectDir, 'CLAUDE.md'), join(projectDir, 'AGENTS.md'))) return 'CLAUDE.md and AGENTS.md are the same file'
  return null
}

// AGENTS.md when it exists and Git does not ignore it (a template may regenerate an ignored one); otherwise CLAUDE.md.
export function instructionFile(projectDir) {
  const agents = join(projectDir, 'AGENTS.md')
  return existsSync(agents) && !isIgnored(projectDir, 'AGENTS.md') ? agents : join(projectDir, 'CLAUDE.md')
}

// When the block belongs in CLAUDE.md, a block left in AGENTS.md (an earlier layout) moves: its recorded delivery carries over
// unless one is named, and only the stale block is removed from AGENTS.md. `migrated` names that file; `refused` says why nothing was written.
export function writeFlowBlock(projectDir, { delivery } = {}) {
  const file = instructionFile(projectDir)
  const name = relative(projectDir, file)
  const agents = join(projectDir, 'AGENTS.md')
  const stale = name === 'CLAUDE.md' && existsSync(agents) ? readFileSync(agents, 'utf8') : ''
  const migrate = Boolean(stale) && locate(stale) !== null
  const refused = unsafeWrite(projectDir, name) ?? (migrate ? unsafeWrite(projectDir, 'AGENTS.md') : null)
  if (refused) return { file, changed: false, migrated: null, refused }
  const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const carried = normalizeDelivery(delivery) ?? readDelivery(before) ?? (migrate ? readDelivery(stale) : null)
  const after = upsertFlowBlock(before, { delivery: carried })
  if (after !== before) writeFileSync(file, after)
  if (migrate) writeFileSync(agents, removeFlowBlock(stale))
  return { file, changed: after !== before, migrated: migrate ? agents : null, refused: null }
}

// Adds `@AGENTS.md` as the first line of an existing CLAUDE.md when AGENTS.md exists or is ignored (generated);
// the rest of the file is untouched.
export function ensureImport(projectDir) {
  const file = join(projectDir, 'CLAUDE.md')
  const agentsWanted = existsSync(join(projectDir, 'AGENTS.md')) || isIgnored(projectDir, 'AGENTS.md')
  if (!existsSync(file) || !agentsWanted) return { file, changed: false, refused: null }
  const refused = unsafeWrite(projectDir, 'CLAUDE.md')
  if (refused) return { file, changed: false, refused }
  const text = readFileSync(file, 'utf8')
  if (importsOf(text).includes(IMPORT)) return { file, changed: false, refused: null }
  writeFileSync(file, `${IMPORT}${eolOf(text)}${text}`)
  return { file, changed: true, refused: null }
}

// For the setup report: the block's file, whether Git will track it (in a work tree, not ignored), and CLAUDE.md's imports.
export function describeLayout(projectDir) {
  const blockFile = relative(projectDir, instructionFile(projectDir))
  const tracked = git(projectDir, 'rev-parse', '--is-inside-work-tree') === 0 && !isIgnored(projectDir, blockFile)
  const claude = join(projectDir, 'CLAUDE.md')
  const imports = existsSync(claude) ? importsOf(readFileSync(claude, 'utf8')) : []
  return { blockFile, tracked, imports }
}

const isMain = () => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  const [dir = '.', delivery] = process.argv.slice(2)
  if (delivery && !normalizeDelivery(delivery)) {
    console.error(`Delivery must be one of: ${DELIVERY_MODES.join(', ')}`)
    process.exit(1)
  }
  const project = resolve(dir)
  let result
  try {
    result = writeFlowBlock(project, { delivery })
  } catch (error) {
    console.error(`Refused: ${error.message}; nothing written.`)
    process.exit(1)
  }
  const { file, changed, migrated, refused } = result
  if (refused) {
    console.error(`Refused: ${refused}; nothing written.`)
    process.exit(1)
  }
  console.log(`${changed ? 'Wrote' : 'Unchanged'}: ${file}`)
  if (migrated) console.log(`Moved: removed the stale Flow block from ${migrated}`)
  const imported = ensureImport(project)
  if (imported.refused) console.warn(`warning: import not added: ${imported.refused}.`)
  if (imported.changed) console.log(`Imported: ${IMPORT} in ${imported.file}`)
  const layout = describeLayout(project)
  console.log(`Layout: ${JSON.stringify(layout)}`)
  if (!layout.tracked) console.warn(`warning: Git will not commit ${layout.blockFile}, so the Flow block stays out of the repository.`)
}
