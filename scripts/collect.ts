import { readFile } from "node:fs/promises";
import {
  registrySchema,
  type Job,
  type SourceHealth,
  type Source,
} from "../shared/schema";
import profile from "../config/search-profile.json";
import { sourceGate } from "./policy";
import { getAdapter } from "./adapters/index";
import { normalizeJob } from "./normalize-job";
import { fixtureData } from "./fixtures";
import { makeSnapshot, readSnapshot, writeSnapshot } from "./snapshot";
import { mergeJobs } from "./merge";
import { applyCurrentPolicy } from "./projection";
import { args, required } from "./args";
const flags = args();
const now = new Date().toISOString();
const output = required(flags.output, "output");
if (Boolean(flags.fixtures) === Boolean(flags.live))
  throw new Error("Choose exactly one: --fixtures or --live");
const previous = flags.state ? await readSnapshot(flags.state) : undefined;
if (!previous && !flags.bootstrap && !flags.fixtures)
  throw new Error("No previous state: explicit --bootstrap required");
if (
  previous &&
  previous.manifest.mode !== (flags.fixtures ? "fixture" : "live")
)
  throw new Error("Fixture and live history cannot be mixed");
let configuredSources: Source[] = [];
let incoming: Job[] = [];
let sources: SourceHealth[] = [];
if (flags.fixtures) {
  const f = fixtureData(now);
  incoming = f.jobs;
  sources = f.sources;
} else {
  const registry = registrySchema.parse(
    JSON.parse(await readFile(flags.registry ?? "config/sources.json", "utf8")),
  );
  configuredSources = registry.sources;
  for (const source of registry.sources) {
    const prior = previous?.sources.find((s) => s.id === source.id);
    const reason = sourceGate(source, new Date(now));
    const health: SourceHealth = {
      id: source.id,
      name: source.name,
      type: source.type,
      status: !source.enabled ? "disabled" : reason ? "blocked" : "failed",
      coverage: "none",
      complete: false,
      count: 0,
      attemptedAt: reason ? null : now,
      lastSuccessAt: prior?.lastSuccessAt ?? null,
      message: reason ?? "",
      attribution: source.approval.attribution,
      manualUrl: source.url ?? null,
    };
    sources.push(health);
    if (reason) continue;
    try {
      const result = await getAdapter(source);
      const jobs = result.records.map((raw) => normalizeJob(raw, source, now));
      incoming.push(...jobs);
      Object.assign(health, {
        status: result.complete ? "success" : "partial",
        complete: result.complete,
        coverage: result.coverage,
        count: jobs.length,
        lastSuccessAt: now,
        message: result.warnings.join("; ") || "Collection completed",
      });
    } catch {
      health.message =
        "Collection failed: network, provider response, or schema error. Prior observations retained. Run fixture tests and review this source.";
    }
  }
  if (
    !previous &&
    registry.sources.some((s) => s.enabled) &&
    !sources.some((s) => ["success", "partial"].includes(s.status))
  )
    throw new Error(
      "No previous live snapshot and no successful source; refusing publication",
    );
}
const result = mergeJobs(previous, incoming, sources, now, {
  acceptLargeChange: flags["accept-large-change"],
  staleHours: profile.staleAfterHours,
  retentionDays: profile.closedRetentionDays,
});
if (!flags.fixtures)
  result.jobs = applyCurrentPolicy(
    result.jobs,
    configuredSources,
    sources,
    now,
    previous?.sources,
  );
const jobs = result.jobs.filter(
  (j) =>
    !(profile.excludedEmployers as string[]).some(
      (e) => j.companyKey === e.toLowerCase(),
    ) &&
    !(profile.excludedKeywords as string[]).some((w) =>
      `${j.title} ${j.excerpt ?? ""}`.toLowerCase().includes(w.toLowerCase()),
    ),
);
const ids = new Set(jobs.map((j) => j.id));
for (const [from, to] of Object.entries(result.aliases))
  if (!ids.has(to)) delete result.aliases[from];
const snapshot = makeSnapshot(jobs, sources, result.aliases, {
  mode: flags.fixtures ? "fixture" : "live",
  now,
  previous,
  sourceCommit: process.env.GITHUB_SHA ?? "local",
  dataCommit: previous?.manifest.dataCommit,
});
await writeSnapshot(output, snapshot);
console.log(
  JSON.stringify(
    {
      mode: snapshot.manifest.mode,
      jobs: jobs.length,
      newJobs: jobs.filter((j) => !previous?.jobs.some((p) => p.id === j.id))
        .length,
      updatedJobs: jobs.filter((j) =>
        previous?.jobs.some(
          (p) => p.id === j.id && p.contentHash !== j.contentHash,
        ),
      ).length,
      closedJobs: jobs.filter((j) => j.status === "closed").length,
      staleJobs: jobs.filter((j) => j.stale).length,
      sources: sources.map((s) => ({
        id: s.id,
        status: s.status,
        count: s.count,
      })),
      durationSeconds: (Date.now() - Date.parse(now)) / 1000,
    },
    null,
    2,
  ),
);
