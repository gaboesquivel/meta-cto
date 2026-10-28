import { z } from "zod";

const recordId = z.string().min(1).max(200);

export const entityRecordSchema = z.strictObject({
  cta: z.string().max(120).optional(),
  features: z.array(z.string().max(120)).max(16).optional(),
  id: recordId,
  interval: z.string().max(40).optional(),
  kind: z.literal("entity"),
  price: z.string().max(40).optional(),
  summary: z.string().max(2000).optional(),
  tags: z.array(z.string().max(80)).max(32).optional(),
  title: z.string().min(1).max(500),
  url: z.string().min(1).max(2000),
});

export const documentRecordSchema = z.strictObject({
  excerpt: z.string().min(1).max(4000),
  id: recordId,
  kind: z.literal("document"),
  revisedAt: z.string().max(40).optional(),
  title: z.string().min(1).max(500),
  url: z.string().min(1).max(2000),
});

export const metricRecordSchema = z.strictObject({
  id: recordId,
  kind: z.literal("metric"),
  label: z.string().min(1).max(500),
  series: z.array(z.number()).max(24).optional(),
  trend: z.enum(["up", "down", "flat"]).optional(),
  unit: z.string().max(40).optional(),
  value: z.string().min(1).max(200),
});

export const mediaRecordSchema = z.strictObject({
  id: recordId,
  kind: z.literal("media"),
  mimeType: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  url: z.string().min(1).max(2000),
});

export const groundedRecordSchema = z.discriminatedUnion("kind", [
  entityRecordSchema,
  documentRecordSchema,
  metricRecordSchema,
  mediaRecordSchema,
]);
