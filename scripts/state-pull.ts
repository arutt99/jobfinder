import { args, required } from "./args";
import { pullState } from "./state";
const f = args();
const revision = await pullState(required(f.output, "output"), {
  remote: f.remote,
  bootstrap: f.bootstrap,
});
console.log(
  revision
    ? `Read data revision ${revision}`
    : "Explicit bootstrap: no data branch exists",
);
