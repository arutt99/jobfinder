import type { Job, Source, SourceHealth } from "../shared/schema";
import { sourceGate } from "./policy";
import { materialHash } from "./normalize-job";
// Apply the current permission record to retained data, even when fetching failed.
export function applyCurrentPolicy(
  jobs: Job[],
  registry: Source[],
  health: SourceHealth[],
  now: string,
  previousHealth: SourceHealth[] = [],
): Job[] {
  const policies = new Map(registry.map((s) => [s.id, s]));
  const result: Job[] = [];
  for (const old of jobs) {
    const sources = old.observations.map((o) => policies.get(o.sourceId));
    const denied = old.observations.filter(
      (_, i) =>
        !sources[i] ||
        sourceGate({ ...sources[i]!, enabled: true }, new Date(now)),
    );
    if (denied.length) {
      for (const observation of denied) {
        let h = health.find((s) => s.id === observation.sourceId);
        if (!h) {
          const prior = previousHealth.find(
            (s) => s.id === observation.sourceId,
          );
          h = {
            id: observation.sourceId,
            name: prior?.name ?? observation.sourceId,
            type: prior?.type ?? "removed",
            status: "blocked",
            coverage: "none",
            complete: false,
            count: 0,
            attemptedAt: null,
            lastSuccessAt: prior?.lastSuccessAt ?? null,
            message:
              "Source removed from registry; public contribution withdrawn",
            attribution: null,
            manualUrl: null,
          };
          health.push(h);
        }
        h.status = "blocked";
        h.complete = false;
        h.count = 0;
        h.message =
          "Current source permission is unavailable or expired; public contribution withdrawn";
      }
      continue;
    }
    const job = structuredClone(old);
    const optional = {
      locations: [],
      workplace: "unknown",
      remoteEligibility: [],
      employmentType: null,
      salary: null,
      postedAt: null,
      sourceUpdatedAt: null,
      validThrough: null,
      excerpt: null,
    };
    for (const [field, unknown] of Object.entries(optional))
      if (!sources.every((s) => s!.approval.publicFields.includes(field)))
        Object.assign(job, { [field]: unknown });
    if (!job.postedAt) job.postedAtBasis = "unknown";
    job.attribution =
      [
        ...new Set(sources.map((s) => s!.approval.attribution).filter(Boolean)),
      ].join(" · ") || null;
    job.contentHash = materialHash(job);
    result.push(job);
  }
  const ids = new Set(result.map((j) => j.id));
  for (const j of result)
    j.possibleDuplicateIds = j.possibleDuplicateIds.filter((id) => ids.has(id));
  return result;
}
