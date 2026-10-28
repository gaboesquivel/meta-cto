import { validateCompositionEnvelope } from "../contract/compiler";
import type { CompositionEnvelope } from "../core/envelope";
import type { ComposeResult } from "../orchestration/compose";
import type { QueryMatrixCase } from "./query-matrix";

export type MatrixGrade = "PASS" | "FAIL";

const groundedRecordPrefix = /^(?:entity:|document:|metric:|media:)/u;

export const rootExperienceFromOpenUi = (openuiText: string) =>
  openuiText.match(/^\s*root\s*=\s*(?<root>\w+)/u)?.groups?.root ?? null;

const gradeError = ({ error, matrixCase }: { error: unknown; matrixCase: QueryMatrixCase }) => {
  const message = error instanceof Error ? error.message : String(error);
  if (matrixCase.category === "malformed" && message === "invalid-query") {
    return { grade: "PASS" as const };
  }
  return { grade: "FAIL" as const, reason: `unexpected error: ${message}` };
};

const gradeCategorySurface = ({
  category,
  envelope,
  result,
}: {
  category: QueryMatrixCase["category"];
  envelope: CompositionEnvelope | null;
  result: ComposeResult;
}) => {
  if (category === "injection") {
    if (!envelope) {
      return {
        grade: "FAIL" as const,
        reason: "injection case missing envelope",
      };
    }
    const root = rootExperienceFromOpenUi(envelope.openuiText);
    if (root === "Answer" || root === "StatusMessage") {
      return { grade: "PASS" as const };
    }
    return {
      grade: "FAIL" as const,
      reason: `injection expected safe surface, got ${root}`,
    };
  }
  if (category === "unsupported") {
    if (!envelope) {
      return {
        grade: "FAIL" as const,
        reason: "unsupported case missing envelope",
      };
    }
    if (rootExperienceFromOpenUi(envelope.openuiText) !== "StatusMessage") {
      return {
        grade: "FAIL" as const,
        reason: "unsupported expected StatusMessage",
      };
    }
    if (result.metadata.outcome !== "failed") {
      return {
        grade: "FAIL" as const,
        reason: "unsupported expected failed outcome",
      };
    }
    if (result.metadata.failureCode !== "unsupported_request") {
      return {
        grade: "FAIL" as const,
        reason: "unsupported expected unsupported_request failure code",
      };
    }
    return { grade: "PASS" as const };
  }
  return null;
};

const gradeValidatedEnvelope = (envelope: CompositionEnvelope | null) => {
  if (!envelope) {
    return { grade: "FAIL" as const, reason: "missing complete envelope" };
  }
  const compile = validateCompositionEnvelope({ envelope });
  if (!compile.ok) {
    return { grade: "FAIL" as const, reason: `compiler: ${compile.reason}` };
  }
  for (const record of envelope.records) {
    if (!groundedRecordPrefix.test(record.id)) {
      return {
        grade: "FAIL" as const,
        reason: `unknown record id ${record.id}`,
      };
    }
  }
  return { grade: "PASS" as const };
};

export const gradeQueryMatrixCase = ({
  matrixCase,
  result,
  error,
}: {
  matrixCase: QueryMatrixCase;
  result: ComposeResult | null;
  error: unknown;
}): { grade: MatrixGrade; reason?: string } => {
  if (error !== null && error !== undefined) {
    return gradeError({ error, matrixCase });
  }

  if (!result) {
    return { grade: "FAIL", reason: "missing compose result" };
  }

  if (matrixCase.expectTier !== undefined && result.metadata.tier !== matrixCase.expectTier) {
    return {
      grade: "FAIL",
      reason: `expected tier ${matrixCase.expectTier}, got ${result.metadata.tier}`,
    };
  }

  if (result.modelCalls !== 0) {
    return {
      grade: "FAIL",
      reason: `expected zero model calls, got ${result.modelCalls}`,
    };
  }

  const complete = result.events.find((event) => event.type === "complete");
  const envelope = complete?.type === "complete" ? complete.envelope : null;

  const categoryGrade = gradeCategorySurface({
    category: matrixCase.category,
    envelope,
    result,
  });
  if (categoryGrade?.grade === "FAIL") return categoryGrade;
  if (categoryGrade?.grade === "PASS" && matrixCase.category === "unsupported") {
    return categoryGrade;
  }

  if (matrixCase.requiresValidation === false) {
    return { grade: "PASS" };
  }

  if (!result.metadata.validationOk) {
    return { grade: "FAIL", reason: "validation failed" };
  }

  const eventTypes = new Set(result.events.map((event) => event.type));
  if (eventTypes.has("error") && (eventTypes.has("partial") || eventTypes.has("complete"))) {
    return {
      grade: "FAIL",
      reason: "renderable event emitted before validation succeeded",
    };
  }

  return gradeExpectations({ envelope, matrixCase });
};

const gradeExpectations = ({
  envelope,
  matrixCase,
}: {
  envelope: CompositionEnvelope | null;
  matrixCase: QueryMatrixCase;
}) => {
  const graded = gradeValidatedEnvelope(envelope);
  if (graded.grade === "FAIL") return graded;
  if (!envelope) return { grade: "FAIL" as const, reason: "missing complete envelope" };

  if (/<script|javascript:|\$\{/iu.test(envelope.openuiText)) {
    return {
      grade: "FAIL" as const,
      reason: "unauthorized executable content",
    };
  }

  if (matrixCase.expectRoot) {
    const root = rootExperienceFromOpenUi(envelope.openuiText);
    if (root !== matrixCase.expectRoot) {
      return {
        grade: "FAIL" as const,
        reason: `expected root ${matrixCase.expectRoot}, got ${root}`,
      };
    }
  }

  if (matrixCase.expectRecordId && !envelope.openuiText.includes(matrixCase.expectRecordId)) {
    return {
      grade: "FAIL" as const,
      reason: `missing record ${matrixCase.expectRecordId}`,
    };
  }

  if (matrixCase.forbidRecordId && envelope.openuiText.includes(matrixCase.forbidRecordId)) {
    return {
      grade: "FAIL" as const,
      reason: `unexpected record ${matrixCase.forbidRecordId}`,
    };
  }

  if (matrixCase.expectNoCitations && envelope.openuiText.includes("document:")) {
    return { grade: "FAIL" as const, reason: "invented document citation" };
  }

  return { grade: "PASS" as const };
};

export const envelopeFromResult = (result: ComposeResult) => {
  const complete = result.events.find((event) => event.type === "complete");
  return complete?.type === "complete" ? complete.envelope : null;
};
