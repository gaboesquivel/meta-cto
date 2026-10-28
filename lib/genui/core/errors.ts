export type CompileErrorCode =
  | "empty_document"
  | "oversized_document"
  | "excessive_complexity"
  | "malformed_grammar"
  | "invalid_root"
  | "unsupported_library_version"
  | "unknown_component"
  | "unknown_property"
  | "invalid_property_type"
  | "missing_required_property"
  | "unknown_composite"
  | "composite_incompatible"
  | "unsupported_component"
  | "missing_record"
  | "duplicate_record_id"
  | "duplicate_entity_ids"
  | "invalid_recipe_cardinality"
  | "record_kind_mismatch"
  | "forbidden_property"
  | "forbidden_value"
  | "unauthorized_executable"
  | "unauthorized_endpoint"
  | "truncated_document"
  | "unexpected_trailing_content"
  | "parse";

export interface CompileExperienceFailure {
  ok: false;
  code: CompileErrorCode;
  detail?: string;
}

export interface CompiledComposition {
  ok: true;
  component: string;
  composite: string | null;
  props: Record<string, unknown>;
  referencedRecordIds: string[];
}

export type CompileResult = CompileExperienceFailure | CompiledComposition;
