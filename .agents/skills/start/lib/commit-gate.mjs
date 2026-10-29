export const ESSENTIAL_CHECK_IDS = [
  'setup',
  'qa',
  'build',
  'eval',
  'portless_startup',
  'http_home',
  'http_genui',
  'http_mcp',
  'operator_fail_closed',
  'identity_scan',
  'gitignore_artifacts',
]

const UNAVAILABLE_ALLOWED = new Set(['operator_authenticated'])

export const normalizeCheckResults = (results) =>
  (results ?? []).map((entry) => ({
    id: entry.id,
    status: entry.status,
    detail: entry.detail ?? '',
  }))

export const canCreateInitialCommit = ({ checkResults }) => {
  const results = normalizeCheckResults(checkResults)
  const byId = new Map(results.map((r) => [r.id, r]))

  const missing = ESSENTIAL_CHECK_IDS.filter((id) => !byId.has(id))
  if (missing.length)
    return { ok: false, reason: `Essential checks not recorded: ${missing.join(', ')}` }

  const failed = results.filter((r) => r.status === 'failed')
  if (failed.length)
    return { ok: false, reason: `Failed checks block initial commit: ${failed.map((r) => r.id).join(', ')}` }

  const essentialFailed = ESSENTIAL_CHECK_IDS.filter((id) => byId.get(id)?.status === 'failed')
  if (essentialFailed.length)
    return { ok: false, reason: `Essential verification failed: ${essentialFailed.join(', ')}` }

  const startup = byId.get('portless_startup')
  if (startup?.status !== 'passed')
    return { ok: false, reason: 'Application startup (Portless) must pass before initial commit.' }

  const extraFailed = results.filter((r) => r.status === 'failed' && !UNAVAILABLE_ALLOWED.has(r.id))
  if (extraFailed.length) return { ok: false, reason: 'One or more checks failed.' }

  return { ok: true }
}

export const formatInitialCommitMessage = ({ slug }) => `chore: initialize ${slug}`
