"use client";

import { Button, buttonVariants } from "@/components/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/chart";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { useMemo, useState } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import type { GroundedRecord } from "../core/envelope";
import { getFormSchema } from "../fixtures/form-schemas";

const recordTitle = (records: GroundedRecord[], id: string) => {
  const record = records.find((item) => item.id === id);
  if (record?.kind === "entity" || record?.kind === "document") {
    return record.title;
  }
  return id;
};

export const AnswerView = ({
  body,
  records,
  sourceIds,
}: {
  body: string;
  records: GroundedRecord[];
  sourceIds: string[];
}) => (
  <article className="space-y-3">
    <p className="text-foreground text-sm leading-relaxed">{body}</p>
    {sourceIds.length > 0 ? (
      <ul className="text-muted-foreground flex flex-wrap gap-2 text-xs">
        {sourceIds.map((id) => {
          const record = records.find((r) => r.id === id);
          const href =
            record &&
            (record.kind === "entity" || record.kind === "document") &&
            record.url.startsWith("/")
              ? record.url
              : null;
          const label = recordTitle(records, id);
          return (
            <li className="border-border rounded-md border px-2 py-1" key={id}>
              {href ? (
                <a className="text-primary hover:underline" href={href}>
                  {label}
                </a>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
    ) : null}
  </article>
);

export const CollectionGridView = ({
  composite,
  entityIds,
  records,
}: {
  composite: string;
  entityIds: string[];
  records: GroundedRecord[];
}) => (
  <section className="space-y-2">
    <p className="text-muted-foreground text-xs tracking-wide uppercase">{composite}</p>
    <ul className="grid gap-3 sm:grid-cols-2">
      {entityIds.map((id) => {
        const record = records.find((r) => r.id === id);
        const href = record?.kind === "entity" && record.url.startsWith("/") ? record.url : null;
        const title = recordTitle(records, id);
        const summary = record?.kind === "entity" && record.summary ? record.summary : null;
        return (
          <li className="border-border rounded-lg border p-3" key={id}>
            {href ? (
              <a className="text-primary font-medium hover:underline" href={href}>
                {title}
              </a>
            ) : (
              <h3 className="font-medium">{title}</h3>
            )}
            {summary ? <p className="text-muted-foreground mt-1 text-xs">{summary}</p> : null}
          </li>
        );
      })}
    </ul>
  </section>
);

const ComparisonPlanCard = ({
  entity,
  id,
  records,
}: {
  entity: Extract<GroundedRecord, { kind: "entity" }> | null;
  id: string;
  records: GroundedRecord[];
}) => {
  const title = recordTitle(records, id);
  const summary = entity?.summary ?? null;
  const price = entity?.price ?? null;
  const interval = entity?.interval ?? null;
  const features = entity?.features ?? [];
  const cta = entity?.cta ?? "Choose plan";
  const href = entity?.url ?? null;

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="text-lg">{title}</CardTitle>
        {price ? (
          <p className="text-foreground text-2xl font-semibold tabular-nums">
            {price}
            {interval ? (
              <span className="text-muted-foreground text-sm font-normal"> {interval}</span>
            ) : null}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {summary ? <p className="text-muted-foreground text-sm">{summary}</p> : null}
        {features.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {features.map((feature) => (
              <li className="flex gap-2" key={feature}>
                <span aria-hidden className="text-primary">
                  •
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      <CardFooter>
        {href ? (
          <a
            className={buttonVariants({
              className: "w-full",
              variant: "default",
            })}
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {cta}
          </a>
        ) : (
          <Button className="w-full" type="button">
            {cta}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export const ComparisonViewUi = ({
  entityIds,
  records,
}: {
  entityIds: string[];
  records: GroundedRecord[];
}) => (
  <div className="grid gap-4 md:grid-cols-2">
    {entityIds.map((id) => {
      const record = records.find((r) => r.id === id);
      const entity = record?.kind === "entity" ? record : null;
      return <ComparisonPlanCard entity={entity} id={id} key={id} records={records} />;
    })}
  </div>
);

export const DataExplorerView = ({
  metricIds,
  records,
}: {
  metricIds: string[];
  records: GroundedRecord[];
}) => {
  const metrics = useMemo(
    () =>
      metricIds
        .map((id) => records.find((record) => record.id === id))
        .filter((record): record is GroundedRecord & { kind: "metric" } =>
          Boolean(record && record.kind === "metric"),
        ),
    [metricIds, records],
  );
  const [activeId, setActiveId] = useState(metrics[0]?.id ?? "");
  const active = metrics.find((metric) => metric.id === activeId) ?? metrics[0] ?? null;
  const chartData =
    active?.series?.map((value, index) => ({
      index: String(index + 1),
      value,
    })) ?? [];

  return (
    <section className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div className="border-border rounded-lg border p-3" key={metric.id}>
            <dt className="text-muted-foreground text-xs">{metric.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {metric.value}
              {metric.unit ? ` ${metric.unit}` : ""}
            </dd>
          </div>
        ))}
      </dl>
      {metrics.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {metrics.map((metric) => (
            <Button
              key={metric.id}
              onClick={() => setActiveId(metric.id)}
              size="sm"
              type="button"
              variant={metric.id === active?.id ? "default" : "secondary"}
            >
              {metric.label}
            </Button>
          ))}
        </div>
      ) : null}
      {active && chartData.length > 0 ? (
        <ChartContainer
          className="aspect-auto h-[200px] w-full"
          config={{
            value: { color: "var(--chart-1)", label: active.label },
          }}
        >
          <BarChart data={chartData}>
            <XAxis dataKey="index" hide />
            <YAxis hide />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={4} />
          </BarChart>
        </ChartContainer>
      ) : null}
    </section>
  );
};

export const TimelineViewUi = ({
  orderedIds,
  records,
}: {
  orderedIds: string[];
  records: GroundedRecord[];
}) => (
  <ol className="border-border space-y-2 border-l pl-4">
    {orderedIds.map((id) => {
      const doc = records.find((record) => record.id === id);
      return (
        <li className="text-sm" key={id}>
          <span className="font-medium">{doc && doc.kind === "document" ? doc.title : id}</span>
          {doc && doc.kind === "document" ? (
            <p className="text-muted-foreground">{doc.excerpt}</p>
          ) : null}
        </li>
      );
    })}
  </ol>
);

export const StatusMessageView = ({ message, variant }: { message: string; variant: string }) => (
  <output className="border-border bg-muted/40 block rounded-md border px-3 py-2 text-sm">
    <span className="font-medium">{variant}: </span>
    {message}
  </output>
);

export const SearchResultsView = ({
  composite,
  entityIds,
  query,
  records,
}: {
  composite: string;
  entityIds: string[];
  query: string;
  records: GroundedRecord[];
}) => (
  <section className="space-y-3">
    <header className="space-y-1">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">{composite}</p>
      <p className="text-sm">
        Results for <span className="font-medium">&ldquo;{query}&rdquo;</span>
      </p>
    </header>
    <ul className="grid gap-3 sm:grid-cols-2">
      {entityIds.map((id) => (
        <li className="border-border rounded-lg border p-3" key={id}>
          <h3 className="font-medium">{recordTitle(records, id)}</h3>
        </li>
      ))}
    </ul>
  </section>
);

export const DetailViewUi = ({
  composite,
  records,
  sourceId,
}: {
  composite: string;
  records: GroundedRecord[];
  sourceId: string;
}) => {
  const record = records.find((item) => item.id === sourceId);
  if (!record) return null;
  if (record.kind === "entity") {
    return (
      <article className="space-y-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{composite}</p>
        <h2 className="text-xl font-semibold">{record.title}</h2>
        {record.summary ? <p className="text-muted-foreground text-sm">{record.summary}</p> : null}
      </article>
    );
  }
  if (record.kind === "document") {
    return (
      <article className="space-y-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{composite}</p>
        <h2 className="text-xl font-semibold">{record.title}</h2>
        <p className="text-sm leading-relaxed">{record.excerpt}</p>
      </article>
    );
  }
  return (
    <article className="space-y-2">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">{composite}</p>
      <h2 className="text-xl font-semibold">{sourceId}</h2>
    </article>
  );
};

export const DocumentationBlockView = ({
  composite,
  documentId,
  records,
}: {
  composite: string;
  documentId: string;
  records: GroundedRecord[];
}) => {
  const doc = records.find((record) => record.id === documentId);
  if (!doc || doc.kind !== "document") return null;
  return (
    <article className="space-y-3">
      <header className="space-y-1">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{composite}</p>
        <h2 className="font-semibold">{doc.title}</h2>
      </header>
      <p className="text-sm leading-relaxed">{doc.excerpt}</p>
      {composite === "code-and-prose" ? (
        <pre className="border-border bg-muted/30 overflow-x-auto rounded-md border p-3 text-xs">
          <code>{doc.excerpt}</code>
        </pre>
      ) : null}
    </article>
  );
};

export const FilePreviewView = ({
  composite,
  mediaId,
  records,
}: {
  composite: string;
  mediaId: string;
  records: GroundedRecord[];
}) => {
  const media = records.find((record) => record.id === mediaId);
  if (!media || media.kind !== "media") return null;
  const isImage = media.mimeType.startsWith("image/");
  return (
    <figure className="space-y-2">
      <figcaption className="text-muted-foreground text-xs tracking-wide uppercase">
        {composite}
      </figcaption>
      <div className="border-border rounded-lg border p-4">
        <p className="font-medium">{media.title}</p>
        <p className="text-muted-foreground text-xs">{media.mimeType}</p>
        <a
          className="mt-3 inline-block text-sm underline"
          href={media.url}
          rel="noreferrer"
          target="_blank"
        >
          {isImage ? `Preview ${media.title}` : "Open file"}
        </a>
      </div>
    </figure>
  );
};

export const InteractiveFormView = ({
  composite,
  formId,
}: {
  composite: string;
  formId: string;
}) => {
  const schema = getFormSchema(formId);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((schema ?? []).map((field) => [field.name, ""])),
  );
  const [submitted, setSubmitted] = useState(false);

  if (!schema) {
    return (
      <section className="space-y-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{composite}</p>
        <StatusMessageView
          message={`Form "${formId}" is not registered on this host.`}
          variant="warning"
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <p className="text-muted-foreground text-xs tracking-wide uppercase">{composite}</p>
      {submitted ? (
        <StatusMessageView
          message="Demo submission captured locally — connect a privileged submit action to persist data."
          variant="empty"
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          {schema.map((field) => (
            <div className="space-y-2" key={field.name}>
              <Label htmlFor={`${formId}-${field.name}`}>{field.label}</Label>
              <Input
                id={`${formId}-${field.name}`}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: event.target.value,
                  }))
                }
                required={field.required}
                type={field.type}
                value={values[field.name] ?? ""}
              />
            </div>
          ))}
          <Button type="submit">Continue</Button>
        </form>
      )}
    </section>
  );
};

export const EvidenceQuoteView = ({
  documentId,
  records,
}: {
  documentId: string;
  records: GroundedRecord[];
}) => {
  const doc = records.find((record) => record.id === documentId);
  if (!doc || doc.kind !== "document") return null;
  return (
    <blockquote className="border-primary/40 border-l-2 pl-4 text-sm">
      <p className="leading-relaxed italic">{doc.excerpt}</p>
      <footer className="mt-2 not-italic">
        <a className="text-primary text-xs font-medium hover:underline" href={doc.url}>
          {doc.title}
        </a>
      </footer>
    </blockquote>
  );
};

export const RankedSignalListView = ({
  entityIds,
  records,
  reviewHref,
}: {
  entityIds: string[];
  records: GroundedRecord[];
  reviewHref?: string;
}) => (
  <ol className="space-y-2">
    {entityIds.map((id, index) => {
      const record = records.find((r) => r.id === id);
      const title = record?.kind === "entity" ? record.title : id;
      const href = record?.kind === "entity" && record.url.startsWith("/") ? record.url : null;
      const support =
        record?.kind === "entity" && record.summary
          ? record.summary.split("·").at(0)?.trim()
          : null;
      return (
        <li className="border-border/60 flex items-start gap-3 border-b pb-2 text-sm" key={id}>
          <span className="text-muted-foreground w-5 shrink-0 tabular-nums">{index + 1}</span>
          <div className="min-w-0 flex-1">
            {href ? (
              <a className="text-primary font-medium hover:underline" href={href}>
                {title}
              </a>
            ) : (
              <span className="font-medium">{title}</span>
            )}
            {support ? <p className="text-muted-foreground text-xs">{support}</p> : null}
          </div>
        </li>
      );
    })}
    {reviewHref ? (
      <li className="pt-2">
        <a className="text-primary text-sm underline" href={reviewHref}>
          Open Review to record a decision
        </a>
      </li>
    ) : null}
  </ol>
);
