import type { Snapshot } from "../shared/schema";
import { readSnapshot, validateSnapshot } from "./snapshot";
import { args, required } from "./args";
import { pathToFileURL } from "node:url";
export function qualityGate(candidate: Snapshot, previous?: Snapshot): void {
  validateSnapshot(candidate);
  if (previous && previous.manifest.mode !== candidate.manifest.mode)
    throw new Error("Cannot replace live history with fixtures or vice versa");
  if (
    previous &&
    previous.jobs.length &&
    !candidate.jobs.length &&
    !candidate.sources.some(
      (s) =>
        s.status === "success" && s.complete && s.coverage === "exhaustive",
    ) &&
    !previous.jobs.every((j) =>
      j.observations.some((o) =>
        candidate.sources.some(
          (s) => s.id === o.sourceId && s.status === "blocked",
        ),
      ),
    )
  )
    throw new Error("Unexplained empty replacement blocked");
  if (
    previous &&
    !candidate.sources.some((s) => ["success", "partial"].includes(s.status)) &&
    candidate.manifest.lastSuccessfulCollectionAt !==
      previous.manifest.lastSuccessfulCollectionAt
  )
    throw new Error("Outage cannot advance successful-collection time");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const flags = args();
  qualityGate(
    await readSnapshot(required(flags.candidate, "candidate")),
    flags.previous ? await readSnapshot(flags.previous) : undefined,
  );
  console.log("Publication quality gate passed");
}
