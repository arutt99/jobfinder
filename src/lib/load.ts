import { snapshotSchema, type Snapshot } from "../../shared/schema";
export async function loadSnapshot(): Promise<Snapshot> {
  const values = await Promise.all(
    ["manifest", "jobs", "sources", "aliases"].map(async (file) => {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/${file}.json`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          "No published snapshot is available. For a local demo, run npm run demo. For live data, bootstrap the collector and stage the snapshot.",
        );
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new Error(
          "The data download is unreadable. Reload data or check the last deployment.",
        );
      }
    }),
  );
  const result = snapshotSchema.safeParse({
    manifest: values[0],
    jobs: values[1],
    sources: values[2],
    aliases: values[3],
  });
  if (!result.success)
    throw new Error(
      "This snapshot uses an invalid or incompatible data format. Check the latest collection and deployment.",
    );
  const s = result.data;
  for (const [name, value] of Object.entries({
    "jobs.json": s.jobs,
    "sources.json": s.sources,
    "aliases.json": s.aliases,
  })) {
    const bytes = new TextEncoder().encode(
      JSON.stringify(value, null, 2) + "\n",
    );
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (
      actual !== s.manifest.hashes[name as keyof Snapshot["manifest"]["hashes"]]
    )
      throw new Error(
        "Snapshot integrity check failed. Please reload data; files may be from different deployments.",
      );
  }
  if (
    s.jobs.length !== s.manifest.jobCount ||
    new Set(s.jobs.map((j) => j.id)).size !== s.jobs.length ||
    (s.manifest.mode === "live" && s.jobs.some((j) => j.synthetic))
  )
    throw new Error(
      "Snapshot data invariants failed. Please check the deployment.",
    );
  return s;
}
