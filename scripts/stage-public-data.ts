import { args, required } from "./args";
import { readSnapshot, writeSnapshot } from "./snapshot";
const flags = args();
const s = await readSnapshot(required(flags.input, "input"));
if (s.manifest.mode === "fixture" && !flags["allow-fixtures"])
  throw new Error(
    "Demo requires explicit --allow-fixtures; production must never use this",
  );
if (flags["data-commit"]) s.manifest.dataCommit = flags["data-commit"];
await writeSnapshot(flags.output ?? "public/data", s);
console.log(
  `Staged only manifest, jobs, sources, aliases (${s.manifest.mode})`,
);
