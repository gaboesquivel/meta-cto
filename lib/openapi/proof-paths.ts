/** OpenAPI fragments for the Proof Report (spec 003): GET /api/proof and the proof_report tool. */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const errorContent = { "application/json": { schema: ref("ApiError") } };
const err = (description: string, codes: string[]) => ({
  content: errorContent,
  description: `${description} (code: ${codes.join(", ")})`,
});

const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };
const integer = { type: "integer" };
const bool = { type: "boolean" };
const nullableNumber = { type: ["number", "null"] };
const verdict = {
  description: "pass only when the whole 95% interval clears the bar and minimums are met",
  enum: ["pass", "fail", "inconclusive"],
  type: "string",
};
const interval = {
  description: "95% Wilson interval; null when there is nothing to measure",
  oneOf: [
    {
      properties: { lower: { type: "number" }, upper: { type: "number" } },
      required: ["lower", "upper"],
      type: "object",
    },
    { type: "null" },
  ],
};
const counts = { additionalProperties: integer, type: "object" };
const nullable = (schema: object) => ({ oneOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>, extra: object = {}) => ({
  properties,
  required: Object.keys(properties),
  type: "object",
  ...extra,
});

const baseline = object({
  backlogRequests: { type: ["integer", "null"] },
  coverage: nullableNumber,
  duplicates: integer,
  expectedRate: { description: "Stated before the run", type: ["number", "null"] },
  interval,
  rate: nullableNumber,
  reviewed: integer,
});

const proofBar = object(
  {
    bar: { description: "The bar in words", type: "string" },
    baseline: nullable(baseline),
    consequence: { description: "What follows when the bar fails", type: ["string", "null"] },
    counts,
    interval,
    key: {
      enum: ["intakeDuplicateRate", "reviewCoverage", "sameNeedPrecision", "relatedNeedPrecision"],
      type: "string",
    },
    label: str,
    reading: nullable(object({ at: str, current: bool, promptVersion: str })),
    reasons: { description: "Why inconclusive or failed", items: str, type: "array" },
    threshold: nullableNumber,
    value: nullableNumber,
    verdict,
  },
  { description: "One preset bar with its value, counts, interval and verdict" },
);

const scoredGroup = {
  additionalProperties: true,
  properties: { interval, rate: nullableNumber },
  required: ["rate", "interval"],
  type: "object",
};

const fileState = {
  additionalProperties: true,
  properties: { changed: bool, frozen: bool, message: str, readable: bool },
  required: ["readable"],
  type: "object",
};

const proofReport = object(
  {
    bars: { items: ref("ProofBar"), type: "array" },
    consequences: { items: str, type: "array" },
    generatedAt: { format: "date-time", type: "string" },
    killCriterionTriggered: {
      description: "Same-Need Precision failed: drop suggest-before-submit, PM-only grouping",
      type: "boolean",
    },
    narrowToTwoWay: {
      description: "Related-Need Precision failed: submitters get a two-way verdict",
      type: "boolean",
    },
    readiness: object({
      heldOutV2: fileState,
      pilotFiles: fileState,
      promptVersion: object({ current: nullableStr, reading: nullableStr }),
      readingResets: { items: str, type: "array" },
    }),
    slice3: { enum: ["may_start", "not_yet"], type: "string" },
    supporting: object({
      agentCorrectness: nullable({
        ...scoredGroup,
        description: "Agent Correctness against the Answer Key, with harm and miss",
      }),
      notes: { items: str, type: "array" },
      pmAgreement: nullable(object({ blind: scoredGroup, nonBlind: scoredGroup })),
      suggestionAcceptance: nullable({
        ...scoredGroup,
        description: "Reported, not evidence (evidence: false)",
        required: ["rate", "evidence", "note"],
      }),
    }),
    verdict,
  },
  {
    description:
      "Every preset bar of the proof run with pass, fail or inconclusive and the consequences",
  },
);

export const proofSchemas = { ProofBar: proofBar, ProofReport: proofReport };

export const proofPaths = {
  "/api/proof": {
    get: {
      description:
        "Read-only. Needs the Pilot Key or Operator access; anything else is refused. Each preset bar (pilot Intake Duplicate Rate ≤ ½ the backlog baseline, Review Coverage ≥ 80% over about 200 filings, Same-Need Precision ≥ 85% and Related-Need Precision ≥ 75% on Held-Out Set v2) with value, counts, 95% interval and pass, fail or inconclusive; the consequences; supporting metrics; readiness of the frozen sets.",
      operationId: "getProofReport",
      responses: {
        "200": {
          content: { "application/json": { schema: ref("ProofReport") } },
          description: "The Proof Report",
        },
        "401": err(
          "Neither the Pilot Key nor Operator access, or a wrong Pilot Key (details in reason)",
          ["pilot_key_required"],
        ),
        "503": err("No Pilot Key is configured and the caller is not an Operator (fails closed)", [
          "pilot_key_required",
        ]),
      },
      security: [
        { pilotKey: [] },
        { operatorBearer: [] },
        { operatorSecret: [] },
        { operatorSession: [] },
      ],
      summary: "Proof Report: preset bars with pass, fail or inconclusive",
      tags: ["signal"],
    },
  },
};

export const proofMcpTools = {
  proof_report: {
    operationId: "mcpProofReport",
    requestBody: { properties: {}, type: "object" },
    summary:
      "Read the Proof Report (public MCP with the Pilot Key, or the Operator MCP); same body as GET /api/proof. A refused key is pilot_key_required: branch on error.details.reason (missing | invalid | disabled)",
  },
};
