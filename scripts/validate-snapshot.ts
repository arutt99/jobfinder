import { args, required } from "./args";
import { readSnapshot } from "./snapshot";
const s = await readSnapshot(required(args().input, "input"));
console.log(
  `Validated ${s.jobs.length} jobs (${s.manifest.mode}) with SHA-256 checksums`,
);
