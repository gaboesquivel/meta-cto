const FLOW_IDENTITY_MARKERS = [
  'From intent to verified software',
  'Make product engineering with AI agents simpler',
  'Flow is a lightweight, human-led product engineering methodology',
  'Strategic chain',
]

export const buildBaselineDocs = ({ projectName, slug, template, templateSha, portlessHost }) => ({
  'PRODUCT.md': `# ${projectName}

## Definition

${projectName} is a new application initialized from the **${template}** template (${templateSha}).

This document describes **this product only**. It is not Flow's methodology identity from flow-skills.

## Current scope

The repository ships the template application shell: public routes (\`/\`, \`/genui\`), public MCP (\`/api/mcp\`), and Operator surfaces that fail closed until \`OPERATOR_SECRET\` is configured. Product features beyond that shell are not defined yet.

## Technical baseline

- Package / Portless slug: \`${slug}\`
- Local dev host: \`${portlessHost}\`
- Template: \`${template}\` at \`${templateSha}\`
`,
  'DESIGN.md': `# ${projectName} — design notes

## Experience baseline

The UI inherits the ${template} template: a minimal home page, GenUI playground at \`/genui\`, and developer links at \`/dev\`. Replace the home experience when the product direction is known.

## Constraints carried from the template

- Operator and protected MCP require \`OPERATOR_SECRET\` (minimum 16 characters) and fail closed when unset.
- GenUI offline fixtures work without live model credentials; open-ended generation needs gateway or explicit local overrides documented in \`.env.example\`.
`,
  'ARCHITECTURE.md': `# ${projectName} — architecture

## Foundation

Initialized from [\`${template}\`](https://github.com/gaboesquivel/${template}) at commit \`${templateSha}\`.

## Runtime surfaces

| Surface | Path | Notes |
| --- | --- | --- |
| Web home | \`/\` | Replaceable stub |
| GenUI playground | \`/genui\` | OpenUI compose + preview |
| Public MCP | \`/api/mcp\`, \`/.well-known/mcp.json\` | Streamable HTTP |
| Operator | \`/operator\`, \`/api/mcp/operator\` | Protected; fail closed without secret |

Cross-template interoperability details live in \`docs/INTEROP.md\` from the template (upstream template names may appear there by design).

## Local development

- \`pnpm setup\` — dependencies and template technical skills
- \`pnpm dev\` — Portless at \`${portlessHost}\`
`,
  'GLOSSARY.md': `# ${projectName} — glossary

| Term | Meaning |
| --- | --- |
| **Portless host** | Local dev URL host (\`${portlessHost}\`) used by the template's Portless configuration |
| **Public MCP** | Unauthenticated MCP tools at \`/api/mcp\` (health, catalog, compose_ui) |
| **Operator** | Protected console and MCP; requires \`OPERATOR_SECRET\`; fails closed when unset |
`,
})

export const baselineDocsRejectFlowIdentity = (docs) => {
  const combined = Object.values(docs).join('\n')
  const hits = FLOW_IDENTITY_MARKERS.filter((marker) => combined.includes(marker))
  return hits.length === 0 ? { ok: true } : { ok: false, reason: `Baseline docs must not copy Flow identity: ${hits.join('; ')}` }
}

export const baselineDocsIncludeProjectName = ({ docs, projectName }) =>
  Object.values(docs).every((text) => text.includes(projectName))
