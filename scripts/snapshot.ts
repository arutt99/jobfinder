import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  snapshotSchema,
  type Snapshot,
  type Job,
  type SourceHealth,
} from "../shared/schema";
export const serialize = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
export const checksum = (v: unknown) =>
  createHash("sha256").update(serialize(v)).digest("hex");
export function makeSnapshot(
  jobs: Job[],
  sources: SourceHealth[],
  aliases: Record<string, string>,
  options: {
    mode: "fixture" | "live";
    now: string;
    previous?: Snapshot;
    sourceCommit?: string;
    dataCommit?: string;
  },
): Snapshot {
  const success = sources.some(
    (s) => s.status === "success" || s.status === "partial",
  );
  const attempted = sources.filter((s) => s.status !== "disabled");
  const hashes = {
    "jobs.json": checksum(jobs),
    "sources.json": checksum(sources),
    "aliases.json": checksum(aliases),
  };
  return snapshotSchema.parse({
    jobs,
    sources,
    aliases,
    manifest: {
      schemaVersion: 1,
      mode: options.mode,
      dataVersion: createHash("sha256")
        .update(JSON.stringify(hashes))
        .digest("hex")
        .slice(0, 16),
      generatedAt: options.now,
      lastSuccessfulCollectionAt: success
        ? options.now
        : (options.previous?.manifest.lastSuccessfulCollectionAt ?? null),
      lastCompleteRefreshAt:
        attempted.length &&
        attempted.every((s) => s.status === "success" && s.complete)
          ? options.now
          : (options.previous?.manifest.lastCompleteRefreshAt ?? null),
      sourceCommit: options.sourceCommit ?? "local",
      dataCommit: options.dataCommit ?? "uncommitted",
      jobCount: jobs.length,
      hashes,
    },
  });
}
export async function readSnapshot(path: string): Promise<Snapshot> {
  const [manifest, jobs, sources, aliases] = await Promise.all(
    ["manifest", "jobs", "sources", "aliases"].map(
      async (f) =>
        JSON.parse(
          await readFile(resolve(path, `${f}.json`), "utf8"),
        ) as unknown,
    ),
  );
  const result = snapshotSchema.parse({ manifest, jobs, sources, aliases });
  validateSnapshot(result);
  return result;
}
export function validateSnapshot(s: Snapshot): void {
  snapshotSchema.parse(s);
  if (
    s.jobs.length !== s.manifest.jobCount ||
    new Set(s.jobs.map((j) => j.id)).size !== s.jobs.length
  )
    throw new Error("Job count or identity invariant failed");
  for (const [file, value] of Object.entries({
    "jobs.json": s.jobs,
    "sources.json": s.sources,
    "aliases.json": s.aliases,
  }))
    if (
      s.manifest.hashes[file as keyof Snapshot["manifest"]["hashes"]] !==
      checksum(value)
    )
      throw new Error(`Checksum mismatch: ${file}`);
  if (s.manifest.mode === "live" && s.jobs.some((j) => j.synthetic))
    throw new Error("Synthetic jobs cannot be published as live");
  for (const [from, to] of Object.entries(s.aliases)) {
    if (from === to || s.aliases[to] || !s.jobs.some((j) => j.id === to))
      throw new Error("Invalid alias graph");
  }
}
export async function writeSnapshot(
  path: string,
  snapshot: Snapshot,
): Promise<void> {
  validateSnapshot(snapshot);
  const target = resolve(path);
  const temp = `${target}.tmp-${randomUUID()}`;
  const backup = `${target}.backup-${randomUUID()}`;
  await mkdir(temp, { recursive: true });
  for (const [file, data] of Object.entries(snapshot))
    await writeFile(resolve(temp, `${file}.json`), serialize(data));
  let hadPrevious = false;
  try {
    await rename(target, backup);
    hadPrevious = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  try {
    await rename(temp, target);
  } catch (e) {
    if (hadPrevious) await rename(backup, target);
    throw e;
  }
  await rm(backup, { recursive: true, force: true });
}
