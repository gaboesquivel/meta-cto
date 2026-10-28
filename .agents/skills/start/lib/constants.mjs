export const TEMPLATE_IDS = ['flow-next', 'flow-mono']

export const TEMPLATE_GITHUB = {
  'flow-next': 'gaboesquivel/flow-next',
  'flow-mono': 'gaboesquivel/flow-mono',
}

export const FORBIDDEN_INSTRUCTION_BASENAMES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
])

// Root entries an agent session may create before `start` runs (instruction files,
// installed skills, lockfiles). A destination holding only these is bootstrapped in place.
export const AGENT_SETUP_ENTRY_NAMES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.claude',
  '.agents',
  '.cursor',
  'skills-lock.json',
  '.DS_Store',
])

export const TEMPLATE_HINTS = {
  'flow-mono': [/flow-mono/iu, /\bmono(repo)?\b/iu, /turbo(repo)?/iu],
  'flow-next': [/flow-next/iu, /next\.?js/iu, /\bnext\b/iu],
}

export const STALE_SCAN_SKIP_DIR_NAMES = new Set([
  '.git',
  '.claude',
  '.cursor',
  'node_modules',
  '.agents',
  '.next',
  'mcp-app',
  'dist',
])

export const STALE_SCAN_PRESERVE_REL_PATHS = new Set([
  'docs/INTEROP.md',
  '.env.example',
  'PRODUCT.md',
  'DESIGN.md',
  'ARCHITECTURE.md',
  'GLOSSARY.md',
])
