import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readSnapshot } from "./snapshot";
const root = "dist";
async function inspect(path: string): Promise<void> {
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (/(^\.|\.map$|\.env|backup|raw-response|personal)/i.test(e.name))
      throw new Error("Unexpected private or diagnostic artifact");
    if (e.isDirectory()) await inspect(p);
    else if (/\.(json|js|html)$/.test(e.name)) {
      const content = await readFile(p, "utf8");
      if (
        /gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN PRIVATE KEY-----/.test(
          content,
        )
      )
        throw new Error("Credential-shaped content found in artifact");
    }
  }
}
await inspect(root);
const snapshot = await readSnapshot(join(root, "data"));
if (
  snapshot.manifest.mode === "fixture" &&
  process.env.ALLOW_DEMO_ARTIFACT !== "1"
)
  throw new Error("Production artifact contains demo data");
console.log(
  "Artifact contains only frontend assets and a validated public snapshot",
);
