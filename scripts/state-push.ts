import { writeFile, mkdir } from "node:fs/promises";
import { args, required } from "./args";
import { pushState } from "./state";
const f = args();
const revision = await pushState(required(f.input, "input"), {
  remote: f.remote,
  previous: f.previous,
});
await mkdir("work", { recursive: true });
await writeFile("work/data-commit.txt", revision + "\n");
console.log(`Accepted public data revision ${revision}`);
