import type { Job, PersonalState } from "../../shared/schema";
export type Filters = {
  q: string;
  keywordMode: "all" | "any" | "phrase";
  roles: string[];
  tiers: string[];
  workplace: string[];
  location: string;
  countries: string[];
  includeUnknownLocation: boolean;
  eligibility: string[];
  employment: string[];
  sources: string[];
  minScore: number;
  salary: string;
  currency: string;
  interval: string;
  includeUnknownSalary: boolean;
  recency: string;
  dateBasis: "firstSeenAt" | "postedAt";
  lifecycle: string[];
  stale: boolean;
  excluded: string;
  sort: string;
  tracking: string;
};
export const defaults: Filters = {
  q: "",
  keywordMode: "all",
  roles: [],
  tiers: ["strong", "related"],
  workplace: [],
  location: "",
  countries: [],
  includeUnknownLocation: true,
  eligibility: [],
  employment: [],
  sources: [],
  minScore: 0,
  salary: "",
  currency: "USD",
  interval: "year",
  includeUnknownSalary: true,
  recency: "",
  dateBasis: "firstSeenAt",
  lifecycle: ["active"],
  stale: true,
  excluded: "",
  sort: "relevance",
  tracking: "",
};
export function loadFilters(search: string): Filters {
  const p = new URLSearchParams(search);
  const result = { ...defaults };
  for (const k of Object.keys(defaults) as (keyof Filters)[]) {
    if (k === "tracking" || !p.has(k)) continue;
    const v = p.get(k)!;
    const base = defaults[k];
    (result as Record<string, unknown>)[k] = Array.isArray(base)
      ? v.split(",").filter(Boolean)
      : typeof base === "boolean"
        ? v === "true"
        : typeof base === "number"
          ? Math.max(0, Math.min(100, Number(v) || 0))
          : v;
  }
  if (!["all", "any", "phrase"].includes(result.keywordMode))
    result.keywordMode = "all";
  if (!["postedAt", "firstSeenAt"].includes(result.dateBasis))
    result.dateBasis = "firstSeenAt";
  return result;
}
export function filterQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const k of Object.keys(defaults) as (keyof Filters)[])
    if (
      k !== "tracking" &&
      JSON.stringify(f[k]) !== JSON.stringify(defaults[k])
    )
      p.set(
        k,
        Array.isArray(f[k]) ? (f[k] as string[]).join(",") : String(f[k]),
      );
  return p.toString();
}
export function isStale(job: Job, now = Date.now()): boolean {
  return (
    job.stale ||
    !job.lastVerifiedAt ||
    now - Date.parse(job.lastVerifiedAt) > 48 * 3600000
  );
}
export function filterJobs(
  jobs: Job[],
  f: Filters,
  state: PersonalState,
  now = Date.now(),
  view = "discover",
): Job[] {
  const terms = f.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const excluded = f.excluded
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const selected = (values: string[], actual: string[]) =>
    !values.length || values.some((v) => actual.includes(v));
  const filtered = jobs.filter((j) => {
    const p = state.entries[j.id];
    if (view === "saved" && !p?.saved) return false;
    if (
      view === "applications" &&
      (!p || ["none", "interested"].includes(p.stage))
    )
      return false;
    if (p?.hidden && f.tracking !== "hidden") return false;
    if (
      (f.tracking === "hidden" && !p?.hidden) ||
      (f.tracking === "saved" && !p?.saved) ||
      (f.tracking === "unsaved" && p?.saved)
    )
      return false;
    if (
      [
        "applied",
        "interviewing",
        "offer",
        "rejected",
        "withdrawn",
        "interested",
      ].includes(f.tracking) &&
      p?.stage !== f.tracking
    )
      return false;
    const hay =
      `${j.title} ${j.company} ${j.tags.join(" ")} ${j.excerpt ?? ""}`.toLowerCase();
    if (
      terms.length &&
      !(f.keywordMode === "phrase"
        ? hay.includes(f.q.toLowerCase().trim())
        : f.keywordMode === "any"
          ? terms.some((t) => hay.includes(t))
          : terms.every((t) => hay.includes(t)))
    )
      return false;
    if (excluded.some((e) => hay.includes(e))) return false;
    if (
      !selected(f.roles, j.roleFamilies) ||
      !selected(f.tiers, [j.relevance.tier]) ||
      !selected(f.workplace, [j.workplace]) ||
      !selected(
        f.eligibility,
        j.remoteEligibility.length ? j.remoteEligibility : ["Unknown"],
      ) ||
      !selected(f.employment, [j.employmentType ?? "Unknown"]) ||
      !selected(
        f.sources,
        j.observations.map((o) => o.sourceId),
      ) ||
      !selected(f.lifecycle, [j.status]) ||
      j.relevance.score < f.minScore
    )
      return false;
    if (
      f.countries.length &&
      !(j.locations.some((l) => l.country)
        ? j.locations.some(
            (l) => !!l.country && f.countries.includes(l.country),
          )
        : f.includeUnknownLocation)
    )
      return false;
    if (
      f.location &&
      !(j.locations.length
        ? j.locations.some((l) =>
            `${l.raw} ${l.country ?? ""}`
              .toLowerCase()
              .includes(f.location.toLowerCase()),
          )
        : f.includeUnknownLocation)
    )
      return false;
    if (!f.stale && isStale(j, now)) return false;
    if (f.salary && Number(f.salary) > 0) {
      if (!j.salary || (j.salary.min === null && j.salary.max === null)) {
        if (!f.includeUnknownSalary) return false;
      } else if (
        j.salary.currency !== f.currency ||
        j.salary.interval !== f.interval ||
        (j.salary.max ?? j.salary.min ?? 0) < Number(f.salary)
      )
        return false;
    }
    if (f.recency) {
      const date = j[f.dateBasis];
      if (!date || now - Date.parse(date) > Number(f.recency) * 86400000)
        return false;
    }
    return true;
  });
  return filtered.sort((a, b) => {
    const compareDate = (x: string | null, y: string | null) =>
      x && y ? Date.parse(y) - Date.parse(x) : x ? -1 : y ? 1 : 0;
    let n = 0;
    if (f.sort === "relevance")
      n =
        b.relevance.score - a.relevance.score ||
        compareDate(a.firstSeenAt, b.firstSeenAt);
    if (f.sort === "discovered") n = compareDate(a.firstSeenAt, b.firstSeenAt);
    if (f.sort === "posted") n = compareDate(a.postedAt, b.postedAt);
    if (f.sort === "company") n = a.company.localeCompare(b.company);
    if (f.sort === "salary") {
      const salary = (j: Job) =>
        j.salary?.currency === f.currency && j.salary.interval === f.interval
          ? (j.salary.max ?? j.salary.min ?? -1)
          : -1;
      n = salary(b) - salary(a);
    }
    return n || a.id.localeCompare(b.id);
  });
}
export function salaryLabel(j: Job): string {
  const s = j.salary;
  if (!s || (s.min === null && s.max === null))
    return s?.raw ?? "Salary not listed";
  const fmt = (n: number) =>
    !/^[A-Z]{3}$/.test(s.currency ?? "")
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: /^[A-Z]{3}$/.test(s.currency ?? "") ? s.currency! : "USD",
          maximumFractionDigits: 0,
          notation: n >= 10000 ? "compact" : "standard",
        }).format(n);
  const range =
    s.min !== null && s.max !== null
      ? `${fmt(s.min)}–${fmt(s.max)}`
      : s.min !== null
        ? `From ${fmt(s.min)}`
        : `Up to ${fmt(s.max!)}`;
  return `${range}${s.currency ? ` ${s.currency}` : " (currency unknown)"} / ${s.interval}${s.kind === "estimated" ? " · estimated" : ""}`;
}
export function timeAgo(value: string | null, now = Date.now()): string {
  if (!value) return "Unknown";
  const h = Math.max(0, (now - Date.parse(value)) / 3600000);
  return h < 1
    ? "just now"
    : h < 24
      ? `${Math.floor(h)}h ago`
      : `${Math.floor(h / 24)}d ago`;
}
