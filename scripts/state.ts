import { execFileSync } from "node:child_process";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { readSnapshot, serialize, writeSnapshot } from "./snapshot";
function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        ...(process.env.JOBSCOUT_GITHUB_TOKEN
          ? {
              GIT_CONFIG_COUNT: "1",
              GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
              GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.JOBSCOUT_GITHUB_TOKEN}`).toString("base64")}`,
            }
          : {}),
      },
    }).trim();
  } catch {
    throw new Error(
      "Git state operation failed; check data-branch access. Previous state has not been reset.",
    );
  }
}
async function remoteUrl(remote?: string): Promise<string> {
  return remote ?? git(process.cwd(), ["remote", "get-url", "origin"]);
}
async function exists(remote: string): Promise<string | null> {
  const result = git(process.cwd(), [
    "ls-remote",
    "--heads",
    remote,
    "refs/heads/data",
  ]);
  return result.split(/\s/)[0] || null;
}
export async function pullState(
  output: string,
  options: { remote?: string; bootstrap?: boolean } = {},
): Promise<string | null> {
  const remote = await remoteUrl(options.remote);
  const revision = await exists(remote);
  if (!revision) {
    if (!options.bootstrap)
      throw new Error(
        "Data branch is missing. Use --bootstrap for an intentional first run.",
      );
    return null;
  }
  const temp = await mkdtemp(join(tmpdir(), "jobscout-state-"));
  try {
    git(temp, ["init", "--quiet"]);
    git(temp, ["fetch", "--quiet", "--depth=1", remote, "refs/heads/data"]);
    const actual = git(temp, ["rev-parse", "FETCH_HEAD"]);
    const incoming = join(temp, "snapshot");
    await mkdir(incoming);
    for (const file of ["manifest", "jobs", "sources", "aliases"]) {
      const value = git(temp, ["show", `FETCH_HEAD:${file}.json`]);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(incoming, `${file}.json`), value + "\n");
    }
    const snapshot = await readSnapshot(incoming);
    snapshot.manifest.dataCommit = actual;
    await writeSnapshot(output, snapshot);
    return actual;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
export async function pushState(
  input: string,
  options: { remote?: string; previous?: string } = {},
): Promise<string> {
  const candidate = await readSnapshot(input);
  if (candidate.manifest.mode !== "live")
    throw new Error(
      "Fixture state cannot be pushed to the production data branch",
    );
  const previous = options.previous
    ? await readSnapshot(options.previous)
    : undefined;
  const expected = previous?.manifest.dataCommit ?? null;
  const remote = await remoteUrl(options.remote);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await exists(remote);
    if (current !== expected)
      throw new Error(
        "Data branch changed since collection. Re-pull and recollect; stale state was not pushed.",
      );
    const temp = await mkdtemp(join(tmpdir(), "jobscout-push-"));
    try {
      git(temp, ["init", "--quiet"]);
      git(temp, ["config", "user.name", "JobScout collection"]);
      git(temp, ["config", "user.email", "jobscout@users.noreply.github.com"]);
      if (current) {
        git(temp, ["fetch", "--quiet", "--depth=1", remote, "refs/heads/data"]);
        git(temp, ["checkout", "--quiet", "-b", "data", "FETCH_HEAD"]);
      } else git(temp, ["checkout", "--quiet", "--orphan", "data"]);
      // Only normalized, strictly validated public files are persisted.
      for (const [file, value] of Object.entries(candidate)) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(temp, `${file}.json`), serialize(value));
      }
      if (current) {
        const old = JSON.parse(
          await readFile(join(temp, "manifest.json"), "utf8"),
        ) as { dataVersion: string };
        const oldManifest = JSON.parse(
          git(temp, ["show", "HEAD:manifest.json"]),
        ) as { dataVersion: string };
        if (old.dataVersion === oldManifest.dataVersion) return current;
      }
      git(temp, [
        "add",
        "manifest.json",
        "jobs.json",
        "sources.json",
        "aliases.json",
      ]);
      git(temp, [
        "commit",
        "--quiet",
        "-m",
        `Refresh public job snapshot ${candidate.manifest.dataVersion}`,
      ]);
      const revision = git(temp, ["rev-parse", "HEAD"]);
      try {
        git(temp, ["push", "--quiet", remote, "HEAD:refs/heads/data"]);
        return revision;
      } catch {
        if (attempt === 2)
          throw new Error(
            "Data state push failed after bounded retries; no force push was attempted",
          );
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
  throw new Error("Unable to persist state");
}
export async function assertMissing(path: string): Promise<boolean> {
  try {
    await readFile(resolve(path, "manifest.json"));
    return false;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw e;
  }
}
