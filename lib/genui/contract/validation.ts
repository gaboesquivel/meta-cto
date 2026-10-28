import type { GroundedRecord } from "../core/envelope";
import type { ComponentName } from "../registry/components";
import { componentCompositeAllowlist } from "./catalog";
import { checkComponentDocument } from "./policy";
import { parseStackChildren } from "./stack";

const recordKindForComponent = ({
  component,
  props,
}: {
  component: ComponentName;
  props: Record<string, unknown>;
}): { ids: string[]; kind: GroundedRecord["kind"] | "any" } => {
  if (component === "CollectionGrid" || component === "SearchResults") {
    return {
      ids: Array.isArray(props.entityIds) ? props.entityIds.map(String) : [],
      kind: "entity",
    };
  }
  if (component === "ComparisonView") {
    return {
      ids: Array.isArray(props.entityIds) ? props.entityIds.map(String) : [],
      kind: "entity",
    };
  }
  if (component === "TimelineView") {
    return {
      ids: Array.isArray(props.orderedIds) ? props.orderedIds.map(String) : [],
      kind: "any",
    };
  }
  if (component === "DetailView" || component === "DocumentationBlock") {
    const id = String(props.sourceId ?? props.documentId ?? "");
    return {
      ids: id ? [id] : [],
      kind: component === "DetailView" ? "entity" : "document",
    };
  }
  if (component === "DataExplorer") {
    return {
      ids: Array.isArray(props.metricIds) ? props.metricIds.map(String) : [],
      kind: "metric",
    };
  }
  if (component === "FilePreview") {
    return { ids: [String(props.mediaId ?? "")], kind: "media" };
  }
  if (component === "Answer") {
    return {
      ids: Array.isArray(props.sourceIds) ? props.sourceIds.map(String) : [],
      kind: "any",
    };
  }
  return { ids: [], kind: "any" };
};

export const validatePublicRecords = ({ records }: { records: GroundedRecord[] }) => {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      return { code: "duplicate_record_id" as const, ok: false as const };
    }
    seen.add(record.id);
  }
  return { byId: new Map(records.map((r) => [r.id, r])), ok: true as const };
};

export const validateCompositeForComponent = ({
  composite,
  component,
}: {
  composite: string | null;
  component: ComponentName;
}) => {
  if (component === "SectionStack" || component === "Answer" || component === "StatusMessage") {
    return { ok: true as const };
  }
  const allowlist = componentCompositeAllowlist[component];
  if (!allowlist) return { ok: true as const };
  if (!composite) {
    return { code: "missing_required_property" as const, ok: false as const };
  }
  if (!allowlist.includes(composite as (typeof allowlist)[number])) {
    return { code: "composite_incompatible" as const, ok: false as const };
  }
  return { ok: true as const };
};

export const validateRecordReferences = ({
  component,
  props,
  records,
}: {
  component: ComponentName;
  props: Record<string, unknown>;
  records: GroundedRecord[];
}) => {
  const catalog = validatePublicRecords({ records });
  if (!catalog.ok) return catalog;

  const { ids, kind } = recordKindForComponent({ component, props });
  const unique = [...new Set(ids.filter(Boolean))];
  if (component === "ComparisonView" && unique.length < 2) {
    return { code: "invalid_recipe_cardinality" as const, ok: false as const };
  }
  for (const id of unique) {
    const record = catalog.byId.get(id);
    if (!record) {
      return { code: "missing_record" as const, id, ok: false as const };
    }
    if (kind !== "any" && record.kind !== kind) {
      return { code: "record_kind_mismatch" as const, id, ok: false as const };
    }
  }
  return { ok: true as const, referencedRecordIds: unique };
};

export const validateComponentPropsPolicy = ({
  name,
  props,
}: {
  name: string;
  props: Record<string, unknown>;
}) => {
  const policy = checkComponentDocument({ name, props });
  if (!policy.ok) return policy;
  return { name: policy.name as ComponentName, ok: true as const };
};

const compositeFromProps = (component: ComponentName, props: Record<string, unknown>) => {
  if (component === "Answer" || component === "SectionStack" || component === "StatusMessage") {
    return null;
  }
  const { composite } = props;
  return typeof composite === "string" ? composite : null;
};

export const validateComponentSubtree = ({
  component,
  props,
  records,
}: {
  component: ComponentName;
  props: Record<string, unknown>;
  records: GroundedRecord[];
}) => {
  const policy = validateComponentPropsPolicy({ name: component, props });
  if (!policy.ok) return policy;

  const composite = compositeFromProps(policy.name, props);
  const compositeCheck = validateCompositeForComponent({
    component: policy.name,
    composite,
  });
  if (!compositeCheck.ok) return compositeCheck;

  const refs = validateRecordReferences({
    component: policy.name,
    props,
    records,
  });
  if (!refs.ok) return refs;

  return {
    ok: true as const,
    referencedRecordIds: refs.referencedRecordIds,
  };
};

export const validateSectionStackChildren = ({
  props,
  records,
}: {
  props: Record<string, unknown>;
  records: GroundedRecord[];
}) => {
  const parsed = parseStackChildren(props.children);
  if (!parsed.ok) {
    return { code: "invalid_property_type" as const, ok: false as const };
  }
  const referenced = new Set<string>();
  for (const child of parsed.children) {
    const subtree = validateComponentSubtree({
      component: child.typeName,
      props: child.props,
      records,
    });
    if (!subtree.ok) return subtree;
    for (const id of subtree.referencedRecordIds) referenced.add(id);
  }
  return { ok: true as const, referencedRecordIds: [...referenced] };
};
