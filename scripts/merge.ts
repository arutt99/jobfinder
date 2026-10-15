import type { Job, SourceHealth, Snapshot } from "../shared/schema";
import { key } from "../shared/normalize";
export function mergeJobs(
  previous: Snapshot | undefined,
  incoming: Job[],
  sources: SourceHealth[],
  now: string,
  options: {
    acceptLargeChange?: boolean;
    staleHours?: number;
    retentionDays?: number;
  } = {},
): { jobs: Job[]; aliases: Record<string, string> } {
  const health = new Map(sources.map((s) => [s.id, s]));
  for (const s of sources) {
    const priorHealth = previous?.sources.find((p) => p.id === s.id);
    const oldCount =
      priorHealth?.status === "success" &&
      priorHealth.complete &&
      priorHealth.coverage === "exhaustive"
        ? priorHealth.count
        : (previous?.jobs.filter((j) =>
            j.observations.some(
              (o) => o.sourceId === s.id && o.status !== "closed",
            ),
          ).length ?? 0);
    if (
      !options.acceptLargeChange &&
      s.status === "success" &&
      s.complete &&
      s.coverage === "exhaustive" &&
      oldCount >= 20 &&
      s.count < oldCount * 0.5
    ) {
      s.status = "quarantined";
      s.complete = false;
      s.message =
        "Large disappearance quarantined; prior observations preserved";
      s.lastSuccessAt =
        previous?.sources.find((p) => p.id === s.id)?.lastSuccessAt ?? null;
    }
  }
  const jobs = new Map<string, Job>();
  const aliases = { ...previous?.aliases };
  for (const job of previous?.jobs ?? [])
    jobs.set(job.id, structuredClone(job));
  const seen = new Set<string>();
  for (const fresh of incoming) {
    if (health.get(fresh.observations[0].sourceId)?.status === "quarantined")
      continue;
    const observation = fresh.observations[0];
    const old =
      [...jobs.values()].find((j) =>
        j.observations.some(
          (o) =>
            o.sourceId === observation.sourceId &&
            o.sourceJobId === observation.sourceJobId,
        ),
      ) ??
      [...jobs.values()].find(
        (j) =>
          j.canonicalUrl === fresh.canonicalUrl &&
          j.companyKey === fresh.companyKey,
      );
    if (old) {
      if (old.id !== fresh.id) aliases[fresh.id] = old.id;
      const oldObservation = old.observations.find(
        (o) =>
          o.sourceId === observation.sourceId &&
          o.sourceJobId === observation.sourceJobId,
      );
      const mergedObservation = {
        ...observation,
        firstSeenAt: oldObservation?.firstSeenAt ?? observation.firstSeenAt,
      };
      const observations = old.observations.filter(
        (o) =>
          !(
            o.sourceId === observation.sourceId &&
            o.sourceJobId === observation.sourceJobId
          ),
      );
      observations.push(mergedObservation);
      jobs.set(old.id, {
        ...fresh,
        id: old.id,
        firstSeenAt:
          old.firstSeenAt < fresh.firstSeenAt
            ? old.firstSeenAt
            : fresh.firstSeenAt,
        observations,
      });
    } else jobs.set(fresh.id, structuredClone(fresh));
    seen.add(`${observation.sourceId}\0${observation.sourceJobId}`);
  }
  const staleMs = (options.staleHours ?? 48) * 3600000;
  for (const job of jobs.values()) {
    for (const o of job.observations) {
      const s = health.get(o.sourceId);
      if (
        !seen.has(`${o.sourceId}\0${o.sourceJobId}`) &&
        s?.status === "success" &&
        s.complete &&
        s.coverage === "exhaustive"
      ) {
        o.consecutiveMissing++;
        o.status =
          o.consecutiveMissing >= 3
            ? "closed"
            : o.consecutiveMissing >= 2
              ? "possibly_closed"
              : o.status;
        job.missingSince ??= now;
      }
      o.stale = Date.parse(now) - Date.parse(o.lastSeenAt) > staleMs;
    }
    const active = job.observations.some(
      (o) => o.status === "active" && o.consecutiveMissing === 0,
    );
    job.status = active
      ? "active"
      : job.observations.every((o) => o.status === "closed")
        ? "closed"
        : job.observations.some((o) => o.status === "possibly_closed")
          ? "possibly_closed"
          : "active";
    if (job.validThrough && Date.parse(job.validThrough) < Date.parse(now))
      job.status = "closed";
    job.stale = job.observations.every((o) => o.stale);
    if (active) job.missingSince = null;
    const retainedSince =
      job.missingSince ?? job.validThrough ?? job.lastSeenAt;
    if (
      job.status === "closed" &&
      Date.parse(now) - Date.parse(retainedSince) >
        (options.retentionDays ?? 90) * 86400000
    )
      jobs.delete(job.id);
  }
  const result = [...jobs.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const j of result)
    j.possibleDuplicateIds = result
      .filter(
        (o) =>
          o.id !== j.id &&
          o.companyKey === j.companyKey &&
          key(o.title) === key(j.title),
      )
      .map((o) => o.id);
  for (const alias of Object.keys(aliases)) {
    let to = aliases[alias];
    const visited = new Set([alias]);
    while (aliases[to] && !visited.has(to)) {
      visited.add(to);
      to = aliases[to];
    }
    if (!jobs.has(to) || alias === to || visited.has(to)) delete aliases[alias];
    else aliases[alias] = to;
  }
  return { jobs: result, aliases };
}
