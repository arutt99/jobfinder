import { z } from "zod";
export const iso = z.iso.datetime({ offset: true });
export const safeUrl = z
  .string()
  .url()
  .refine(
    (v) =>
      /^https?:\/\//i.test(v) && !new URL(v).username && !new URL(v).password,
    "Only HTTP(S) URLs without embedded credentials",
  );
export const lifecycle = z.enum([
  "active",
  "possibly_closed",
  "closed",
  "unknown",
]);
export const salarySchema = z
  .object({
    min: z.number().nonnegative().nullable(),
    max: z.number().nonnegative().nullable(),
    currency: z.string().nullable(),
    interval: z.enum(["hour", "month", "year", "unknown"]),
    kind: z.enum(["employer_stated", "estimated", "unknown"]),
    raw: z.string().nullable(),
  })
  .strict();
export const observationSchema = z
  .object({
    sourceId: z.string(),
    sourceJobId: z.string(),
    sourceUrl: safeUrl,
    firstSeenAt: iso,
    lastSeenAt: iso,
    consecutiveMissing: z.number().int().nonnegative(),
    status: lifecycle,
    stale: z.boolean(),
  })
  .strict();
export const jobSchema = z
  .object({
    id: z.string().min(1),
    identityVersion: z.literal(1),
    title: z.string().min(1),
    company: z.string().min(1),
    companyKey: z.string(),
    roleFamilies: z.array(z.string()),
    locations: z.array(
      z
        .object({
          raw: z.string(),
          city: z.string().nullable(),
          region: z.string().nullable(),
          country: z.string().nullable(),
        })
        .strict(),
    ),
    workplace: z.enum(["remote", "hybrid", "onsite", "unknown"]),
    remoteEligibility: z.array(z.string()),
    employmentType: z.string().nullable(),
    seniority: z.string().nullable(),
    salary: salarySchema.nullable(),
    postedAt: iso.nullable(),
    postedAtBasis: z.enum(["source", "unknown"]),
    sourceUpdatedAt: iso.nullable(),
    validThrough: iso.nullable(),
    firstSeenAt: iso,
    lastSeenAt: iso,
    lastVerifiedAt: iso.nullable(),
    missingSince: iso.nullable(),
    status: lifecycle,
    stale: z.boolean(),
    canonicalUrl: safeUrl,
    applyUrl: safeUrl,
    excerpt: z.string().nullable(),
    tags: z.array(z.string()),
    relevance: z
      .object({
        score: z.number().min(0).max(100),
        tier: z.enum(["strong", "related", "weak"]),
        ruleVersion: z.string(),
        reasons: z.array(
          z
            .object({
              ruleId: z.string(),
              points: z.number(),
              label: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
    observations: z.array(observationSchema).min(1),
    contentHash: z.string(),
    synthetic: z.boolean(),
    attribution: z.string().nullable(),
    possibleDuplicateIds: z.array(z.string()),
  })
  .strict();
export type Job = z.infer<typeof jobSchema>;
export const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    type: z.enum(["greenhouse", "lever", "ashby", "feed", "career-page"]),
    board: z.string().default(""),
    region: z.enum(["global", "eu"]).default("global"),
    url: safeUrl.optional(),
    enabled: z.boolean(),
    approval: z
      .object({
        status: z.enum(["candidate", "approved", "manual_only", "blocked"]),
        reviewedAt: iso.nullable(),
        reviewAfter: iso.nullable(),
        documentationUrl: safeUrl.nullable(),
        termsUrl: safeUrl.nullable(),
        permissionBasis: z.string().nullable(),
        publicFields: z.array(z.string()),
        attribution: z.string().nullable(),
        maxRetentionDays: z.number().positive().nullable(),
        allowGitHistory: z.boolean().default(false),
      })
      .strict(),
    requestPolicy: z
      .object({
        maxConcurrent: z.literal(1),
        minDelayMs: z.number().nonnegative(),
        timeoutMs: z.number().positive().max(60000),
        maxPages: z.number().int().positive().max(100),
        maxResponseBytes: z.number().positive().max(10000000),
      })
      .strict(),
  })
  .strict();
export type Source = z.infer<typeof sourceSchema>;
export const registrySchema = z
  .object({ schemaVersion: z.literal(1), sources: z.array(sourceSchema) })
  .strict()
  .refine(
    (v) => new Set(v.sources.map((s) => s.id)).size === v.sources.length,
    "Source IDs must be unique",
  );
export const sourceHealthSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    status: z.enum([
      "success",
      "partial",
      "failed",
      "disabled",
      "blocked",
      "quarantined",
    ]),
    coverage: z.enum(["exhaustive", "search", "none"]),
    complete: z.boolean(),
    count: z.number().int().nonnegative(),
    attemptedAt: iso.nullable(),
    lastSuccessAt: iso.nullable(),
    message: z.string(),
    attribution: z.string().nullable(),
    manualUrl: safeUrl.nullable(),
  })
  .strict();
export type SourceHealth = z.infer<typeof sourceHealthSchema>;
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.enum(["fixture", "live"]),
    dataVersion: z.string(),
    generatedAt: iso,
    lastSuccessfulCollectionAt: iso.nullable(),
    lastCompleteRefreshAt: iso.nullable(),
    sourceCommit: z.string(),
    dataCommit: z.string(),
    jobCount: z.number().int().nonnegative(),
    hashes: z
      .object({
        "jobs.json": z.string(),
        "sources.json": z.string(),
        "aliases.json": z.string(),
      })
      .strict(),
  })
  .strict();
export const snapshotSchema = z
  .object({
    manifest: manifestSchema,
    jobs: z.array(jobSchema),
    sources: z.array(sourceHealthSchema),
    aliases: z.record(z.string(), z.string()),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export type RawJob = {
  sourceJobId: string;
  title: string;
  company: string;
  url: string;
  applyUrl?: string;
  text?: string;
  locations?: string[];
  countries?: string[];
  workplace?: Job["workplace"];
  remoteEligibility?: string[];
  employmentType?: string | null;
  salary?: Job["salary"];
  postedAt?: string | null;
  sourceUpdatedAt?: string | null;
  validThrough?: string | null;
};
export const stageSchema = z.enum([
  "none",
  "interested",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
]);
export const personalEntrySchema = z
  .object({
    saved: z.boolean(),
    hidden: z.boolean(),
    stage: stageSchema,
    note: z.string().max(50000),
    updatedAt: iso,
    snapshot: z
      .object({ title: z.string(), company: z.string(), url: safeUrl })
      .strict(),
  })
  .strict();
export type PersonalEntry = z.infer<typeof personalEntrySchema>;
export const personalSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.record(z.string(), personalEntrySchema),
    manual: z.array(jobSchema),
  })
  .strict();
export type PersonalState = z.infer<typeof personalSchema>;
