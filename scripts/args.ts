import { parseArgs } from "node:util";
export function args() {
  return parseArgs({
    options: {
      fixtures: { type: "boolean" },
      live: { type: "boolean" },
      bootstrap: { type: "boolean" },
      "allow-fixtures": { type: "boolean" },
      "accept-large-change": { type: "boolean" },
      input: { type: "string" },
      output: { type: "string" },
      state: { type: "string" },
      previous: { type: "string" },
      candidate: { type: "string" },
      registry: { type: "string" },
      remote: { type: "string" },
      "data-commit": { type: "string" },
    },
    strict: true,
  }).values;
}
export function required(v: string | undefined, flag: string): string {
  if (!v) throw new Error(`Missing --${flag}`);
  return v;
}
