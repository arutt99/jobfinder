import jobs from "../tests/fixtures/jobs.json";
import {
  sourceSchema,
  type Source,
  type RawJob,
  type Job,
  type SourceHealth,
} from "../shared/schema";
import { normalizeJob } from "./normalize-job";
export function fixtureSource(
  id = "demo-greenhouse",
  type: Source["type"] = "greenhouse",
): Source {
  return sourceSchema.parse({
    id,
    name:
      type === "greenhouse"
        ? "Demo · Greenhouse"
        : type === "lever"
          ? "Demo · Lever"
          : "Demo · Ashby",
    type,
    board: "synthetic",
    enabled: true,
    approval: {
      status: "approved",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      reviewAfter: "2099-01-01T00:00:00.000Z",
      documentationUrl: "https://example.invalid/policy",
      termsUrl: "https://example.invalid/terms",
      permissionBasis:
        "Original synthetic fixtures authored for this application",
      publicFields: [
        "title",
        "company",
        "canonicalUrl",
        "applyUrl",
        "derivedMetadata",
        "locations",
        "workplace",
        "remoteEligibility",
        "employmentType",
        "salary",
        "postedAt",
        "sourceUpdatedAt",
        "validThrough",
        "excerpt",
      ],
      attribution: "Synthetic demonstration · no real vacancy",
      maxRetentionDays: null,
      allowGitHistory: true,
    },
    requestPolicy: {
      maxConcurrent: 1,
      minDelayMs: 1500,
      timeoutMs: 20000,
      maxPages: 20,
      maxResponseBytes: 5000000,
    },
  });
}
export function fixtureData(now: string): {
  jobs: Job[];
  sources: SourceHealth[];
} {
  const sources = [
    fixtureSource(),
    fixtureSource("demo-lever", "lever"),
    fixtureSource("demo-ashby", "ashby"),
  ];
  const normalized = jobs.map((raw, index) => {
    const observed = new Date(
      Date.parse(now) - raw.ageHours * 3600000,
    ).toISOString();
    const job = normalizeJob(
      { ...raw, postedAt: observed } as RawJob,
      sources[index % sources.length],
      observed,
      true,
    );
    job.lastSeenAt = now;
    job.lastVerifiedAt = now;
    job.observations[0].lastSeenAt = now;
    return job;
  });
  return {
    jobs: normalized,
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      status: "success",
      coverage: "exhaustive",
      complete: true,
      count: normalized.filter((j) => j.observations[0].sourceId === s.id)
        .length,
      attemptedAt: now,
      lastSuccessAt: now,
      message: "Synthetic fixtures only. No employer board was contacted.",
      attribution: s.approval.attribution,
      manualUrl: null,
    })),
  };
}
