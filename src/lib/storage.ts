import {
  personalSchema,
  type PersonalState,
  type PersonalEntry,
  type Job,
} from "../../shared/schema";
export const storageKey = "jobscout.personal.v1";
export const emptyState = (): PersonalState => ({
  schemaVersion: 1,
  entries: {},
  manual: [],
});
export function readPersonal(storage: Pick<Storage, "getItem"> | null): {
  state: PersonalState;
  warning: string | null;
} {
  try {
    const raw = storage?.getItem(storageKey);
    if (!storage)
      return {
        state: emptyState(),
        warning:
          "Browser storage is unavailable. Export a backup before leaving.",
      };
    if (!raw) return { state: emptyState(), warning: null };
    let value = JSON.parse(raw) as Record<string, unknown>;
    // Original pre-release backups used a jobs map and a version field.
    if (value.version === 0 && value.jobs)
      value = { schemaVersion: 1, entries: value.jobs, manual: [] };
    return { state: personalSchema.parse(value), warning: null };
  } catch {
    return {
      state: emptyState(),
      warning:
        "Saved data could not be read. The original storage has been preserved. Export or restore a backup before saving changes.",
    };
  }
}
export function savePersonal(
  state: PersonalState,
  storage:
    | (Pick<Storage, "setItem"> & Partial<Pick<Storage, "getItem">>)
    | null,
): boolean {
  try {
    if (!storage) return false;
    const raw = storage.getItem?.(storageKey);
    if (raw) {
      let valid = false;
      try {
        valid = personalSchema.safeParse(JSON.parse(raw)).success;
      } catch {
        /* Preserve unreadable input before recovery. */
      }
      if (!valid && !storage.getItem?.(`${storageKey}.recovery`))
        storage.setItem(`${storageKey}.recovery`, raw);
    }
    storage.setItem(storageKey, JSON.stringify(personalSchema.parse(state)));
    return true;
  } catch {
    return false;
  }
}
export function entryFor(job: Job): PersonalEntry {
  return {
    saved: false,
    hidden: false,
    stage: "none",
    note: "",
    updatedAt: new Date().toISOString(),
    snapshot: { title: job.title, company: job.company, url: job.canonicalUrl },
  };
}
export function mergePersonal(
  local: PersonalState,
  incoming: unknown,
  aliases: Record<string, string> = {},
): PersonalState {
  const parsed = personalSchema.parse(incoming);
  const entries: PersonalState["entries"] = Object.create(
    null,
  ) as PersonalState["entries"];
  for (const [id, entry] of [
    ...Object.entries(local.entries),
    ...Object.entries(parsed.entries),
  ]) {
    const target = aliases[id] ?? id;
    if (
      !entries[target] ||
      Date.parse(entry.updatedAt) > Date.parse(entries[target].updatedAt)
    )
      entries[target] = entry;
  }
  return {
    schemaVersion: 1,
    entries,
    manual: [
      ...new Map(
        [...parsed.manual, ...local.manual].map((j) => [j.id, j]),
      ).values(),
    ],
  };
}
export function download(filename: string, value: string, type: string): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(jobs: Job[]): string {
  const cell = (value: string) => {
    const safe = /^[\s\uFEFF]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [
    [
      "Title",
      "Company",
      "Location",
      "Workplace",
      "Salary currency",
      "Salary interval",
      "Minimum",
      "Maximum",
      "Relevance",
      "First seen",
      "URL",
    ],
    ...jobs.map((j) => [
      j.title,
      j.company,
      j.locations.map((l) => l.raw).join("; "),
      j.workplace,
      j.salary?.currency ?? "",
      j.salary?.interval ?? "",
      String(j.salary?.min ?? ""),
      String(j.salary?.max ?? ""),
      String(j.relevance.score),
      j.firstSeenAt,
      j.canonicalUrl,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
