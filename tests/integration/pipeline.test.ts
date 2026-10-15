import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fixtureData, fixtureSource } from "../../scripts/fixtures";
import {
  makeSnapshot,
  readSnapshot,
  writeSnapshot,
} from "../../scripts/snapshot";
import { mergeJobs } from "../../scripts/merge";
import { normalizeJob } from "../../scripts/normalize-job";
import { qualityGate } from "../../scripts/quality-gate";
import { pullState, pushState } from "../../scripts/state";
import type { Job, SourceHealth } from "../../shared/schema";
const now = "2026-10-15T14:00:00.000Z";
const later = "2026-10-16T14:00:00.000Z";
const f = fixtureData(now);
const initial = () =>
  makeSnapshot(f.jobs, f.sources, {}, { mode: "fixture", now });
function health(changes: Partial<SourceHealth> = {}) {
  return f.sources.map((s) => ({ ...s, ...changes }));
}
describe("history, identity and lifecycle", () => {
  it("preserves IDs and first-seen through two durable runs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobscout-test-"));
    try {
      await writeSnapshot(join(dir, "state"), initial());
      const previous = await readSnapshot(join(dir, "state"));
      const second = fixtureData(later);
      const merged = mergeJobs(previous, second.jobs, second.sources, later);
      expect(merged.jobs.map((j) => j.id).sort()).toEqual(
        previous.jobs.map((j) => j.id).sort(),
      );
      expect(
        merged.jobs.find((j) => j.id === previous.jobs[0].id)?.firstSeenAt,
      ).toBe(previous.jobs[0].firstSeenAt);
      const snap = makeSnapshot(merged.jobs, second.sources, merged.aliases, {
        mode: "fixture",
        now: later,
        previous,
      });
      await writeSnapshot(join(dir, "state"), snap);
      expect((await readSnapshot(join(dir, "state"))).jobs[0].lastSeenAt).toBe(
        later,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.each([
    { status: "failed", complete: false, coverage: "exhaustive" },
    { status: "partial", complete: false, coverage: "exhaustive" },
    { status: "success", complete: true, coverage: "search" },
  ] as const)("does not increment missing for $status/$coverage", (outcome) => {
    const result = mergeJobs(initial(), [], health(outcome), later);
    expect(
      result.jobs.every((j) =>
        j.observations.every((o) => o.consecutiveMissing === 0),
      ),
    ).toBe(true);
    expect(
      result.jobs.every(
        (j) =>
          j.lastSeenAt ===
          initial().jobs.find((x) => x.id === j.id)?.lastSeenAt,
      ),
    ).toBe(true);
  });
  it("marks absence after complete enumerations and reopens the same identity", () => {
    let snapshot = initial();
    for (let n = 1; n <= 3; n++) {
      const merged = mergeJobs(snapshot, [], health(), later);
      snapshot = makeSnapshot(merged.jobs, health(), merged.aliases, {
        mode: "fixture",
        now: later,
        previous: snapshot,
      });
      expect(snapshot.jobs[0].observations[0].consecutiveMissing).toBe(n);
      expect(snapshot.jobs[0].status).toBe(
        n === 3 ? "closed" : n === 2 ? "possibly_closed" : "active",
      );
    }
    const reopened = mergeJobs(
      snapshot,
      fixtureData(later).jobs,
      health(),
      later,
    );
    expect(reopened.jobs[0].status).toBe("active");
    expect(reopened.jobs[0].firstSeenAt).toBe(snapshot.jobs[0].firstSeenAt);
    expect(reopened.jobs[0].missingSince).toBeNull();
  });
  it("merges verified canonical destination and preserves provenance/aliases", () => {
    const old = f.jobs[0];
    const another = {
      ...structuredClone(old),
      id: "another-source-id",
      observations: [
        {
          ...old.observations[0],
          sourceId: "demo-lever",
          sourceJobId: "duplicate",
        },
      ],
    };
    const merged = mergeJobs(
      makeSnapshot([old], health(), {}, { mode: "fixture", now }),
      [another],
      health(),
      later,
    );
    expect(merged.jobs).toHaveLength(1);
    expect(merged.jobs[0].observations).toHaveLength(2);
    expect(merged.aliases["another-source-id"]).toBe(old.id);
    expect(merged.jobs[0].status).toBe("active");
  });
  it("keeps different requisitions separate and offers duplicate hints", () => {
    const first = f.jobs[0];
    const second = {
      ...structuredClone(first),
      id: "different",
      canonicalUrl: "https://example.invalid/job?job_id=other",
      observations: [{ ...first.observations[0], sourceJobId: "other" }],
    };
    const merged = mergeJobs(undefined, [first, second], health(), now);
    expect(merged.jobs).toHaveLength(2);
    expect(merged.jobs[0].possibleDuplicateIds).toHaveLength(1);
  });
  it("quarantines a board collapse without erasing history", () => {
    const source = fixtureSource();
    const old: Job[] = Array.from({ length: 25 }, (_, i) =>
      normalizeJob(
        {
          sourceJobId: `${i}`,
          title: "Jira Administrator",
          company: "Demo",
          url: `https://example.invalid/${i}`,
        },
        source,
        now,
        true,
      ),
    );
    const h = [{ ...f.sources[0], count: 25 }];
    const previous = makeSnapshot(old, h, {}, { mode: "fixture", now });
    const next = [{ ...h[0], count: 0 }];
    const result = mergeJobs(previous, [], next, later);
    expect(result.jobs).toHaveLength(25);
    expect(
      result.jobs.every((j) => j.observations[0].consecutiveMissing === 0),
    ).toBe(true);
    expect(next[0].status).toBe("quarantined");
    const accepted = mergeJobs(previous, [], [{ ...h[0], count: 0 }], later, {
      acceptLargeChange: true,
    });
    expect(accepted.jobs[0].observations[0].consecutiveMissing).toBe(1);
  });
  it("keeps success timestamps truthful during a full outage", () => {
    const previous = initial();
    const sources = health({ status: "failed", complete: false });
    const merged = mergeJobs(previous, [], sources, later);
    const next = makeSnapshot(merged.jobs, sources, merged.aliases, {
      mode: "fixture",
      now: later,
      previous,
    });
    qualityGate(next, previous);
    expect(next.manifest.lastSuccessfulCollectionAt).toBe(now);
    expect(next.manifest.generatedAt).toBe(later);
  });
});
describe("publication and atomic snapshots", () => {
  it("detects corrupt files and never accepts synthetic data as live", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobscout-snapshot-"));
    try {
      await writeSnapshot(join(dir, "s"), initial());
      await writeFile(join(dir, "s", "jobs.json"), "[]");
      await expect(readSnapshot(join(dir, "s"))).rejects.toThrow();
      expect(() =>
        makeSnapshot(f.jobs, f.sources, {}, { mode: "live", now }),
      ).not.toThrow();
      await expect(
        writeSnapshot(
          join(dir, "bad"),
          makeSnapshot(f.jobs, f.sources, {}, { mode: "live", now }),
        ),
      ).rejects.toThrow("Synthetic");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("preserves the accepted snapshot if candidate validation fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobscout-atomic-"));
    try {
      await writeSnapshot(join(dir, "s"), initial());
      const bad = initial();
      bad.manifest.jobCount = 0;
      await expect(writeSnapshot(join(dir, "s"), bad)).rejects.toThrow();
      expect((await readSnapshot(join(dir, "s"))).jobs).toHaveLength(14);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("live CLI bootstrap distinguishes an all-disabled registry and never requests it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobscout-cli-"));
    try {
      const source = fixtureSource();
      source.enabled = false;
      await writeFile(
        join(dir, "registry.json"),
        JSON.stringify({ schemaVersion: 1, sources: [source] }),
      );
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/collect.ts",
          "--live",
          "--bootstrap",
          "--registry",
          join(dir, "registry.json"),
          "--output",
          join(dir, "out"),
        ],
        { cwd: process.cwd(), stdio: "pipe" },
      );
      const s = await readSnapshot(join(dir, "out"));
      expect(s.sources[0].status).toBe("disabled");
      expect(s.jobs).toHaveLength(0);
      expect(s.manifest.lastSuccessfulCollectionAt).toBeNull();
      source.enabled = true;
      source.approval.status = "candidate";
      await writeFile(
        join(dir, "registry.json"),
        JSON.stringify({ schemaVersion: 1, sources: [source] }),
      );
      expect(() =>
        execFileSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/collect.ts",
            "--live",
            "--bootstrap",
            "--registry",
            join(dir, "registry.json"),
            "--output",
            join(dir, "blocked"),
          ],
          { cwd: process.cwd(), stdio: "pipe" },
        ),
      ).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("cannot stage fixtures without explicit consent and ignores extra source files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobscout-stage-"));
    try {
      const input = join(dir, "in");
      await writeSnapshot(input, initial());
      await writeFile(join(input, "raw-secret.json"), "private");
      expect(() =>
        execFileSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/stage-public-data.ts",
            "--input",
            input,
            "--output",
            join(dir, "public"),
          ],
          { stdio: "pipe" },
        ),
      ).toThrow();
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/stage-public-data.ts",
          "--input",
          input,
          "--output",
          join(dir, "public"),
          "--allow-fixtures",
        ],
        { stdio: "pipe" },
      );
      await expect(
        readFile(join(dir, "public", "raw-secret.json")),
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
describe("dedicated Git branch state", () => {
  it("requires bootstrap and round trips accepted state with stale-write rejection", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobscout-git-"));
    try {
      const remote = join(dir, "remote.git");
      await mkdir(remote);
      execFileSync("git", ["init", "--bare", "--quiet", remote]);
      await expect(pullState(join(dir, "missing"), { remote })).rejects.toThrow(
        "bootstrap",
      );
      expect(
        await pullState(join(dir, "missing"), { remote, bootstrap: true }),
      ).toBeNull();
      const candidate = makeSnapshot([], [], {}, { mode: "live", now });
      await writeSnapshot(join(dir, "candidate"), candidate);
      const sha = await pushState(join(dir, "candidate"), { remote });
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
      await pullState(join(dir, "previous"), { remote });
      const prior = await readSnapshot(join(dir, "previous"));
      expect(prior.manifest.dataCommit).toBe(sha);
      candidate.manifest.generatedAt = later;
      await writeSnapshot(join(dir, "candidate"), candidate);
      expect(
        await pushState(join(dir, "candidate"), {
          remote,
          previous: join(dir, "previous"),
        }),
      ).toBe(sha);
      await expect(
        pushState(join(dir, "candidate"), { remote }),
      ).rejects.toThrow("changed");
      await expect(
        pullState(join(dir, "oops"), { remote: join(dir, "unreadable") }),
      ).rejects.toThrow("not been reset");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("current permission on retained data", () => {
  it("removes restricted fields during an outage and does not advance complete-refresh time for blocked sources", async () => {
    const { applyCurrentPolicy } = await import("../../scripts/projection");
    const source = fixtureSource();
    source.approval.publicFields = source.approval.publicFields.filter(
      (f) => !["excerpt", "salary"].includes(f),
    );
    const old = structuredClone(
      f.jobs.filter((j) => j.observations[0].sourceId === source.id),
    );
    const h = health({ status: "failed", complete: false });
    const projected = applyCurrentPolicy(old, [source], h, later);
    expect(projected.length).toBeGreaterThan(0);
    expect(
      projected.every((j) => j.excerpt === null && j.salary === null),
    ).toBe(true);
    const previous = initial();
    const s = makeSnapshot(
      f.jobs,
      [
        { ...f.sources[0] },
        { ...f.sources[1], status: "blocked", complete: false },
      ],
      {},
      { mode: "fixture", now: later, previous },
    );
    expect(s.manifest.lastCompleteRefreshAt).toBe(
      previous.manifest.lastCompleteRefreshAt,
    );
    source.enabled = false;
    source.approval.status = "blocked";
    expect(applyCurrentPolicy(old, [source], h, later)).toHaveLength(0);
    expect(h[0].status).toBe("blocked");
  });
  it("does not let an unrelated blocked source justify an empty outage replacement", () => {
    const previous = initial();
    const h = [
      ...health({ status: "failed", complete: false }),
      {
        ...f.sources[0],
        id: "unrelated",
        status: "blocked" as const,
        complete: false,
      },
    ];
    const next = makeSnapshot(
      [],
      h,
      {},
      { mode: "fixture", now: later, previous },
    );
    expect(() => qualityGate(next, previous)).toThrow("empty replacement");
  });
});
