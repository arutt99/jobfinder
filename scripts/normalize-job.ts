import {
  jobSchema,
  type Job,
  type RawJob,
  type Source,
} from "../shared/schema";
import { canonicalUrl, hash, identity, key, text } from "../shared/normalize";
import { match } from "../shared/matching";
export function normalizeJob(
  raw: RawJob,
  source: Source,
  now: string,
  synthetic = false,
): Job {
  const fields = source.approval.publicFields;
  const allowed = (f: string) => synthetic || fields.includes(f);
  const score = match(raw.title, raw.text);
  const url = canonicalUrl(raw.url);
  const applyUrl = canonicalUrl(raw.applyUrl ?? raw.url);
  const value = {
    id: identity(source.type, source.board || source.id, raw.sourceJobId),
    identityVersion: 1,
    title: text(raw.title),
    company: text(raw.company),
    companyKey: key(raw.company),
    ...score,
    locations: allowed("locations")
      ? (raw.locations ?? []).map((l, i) => ({
          raw: text(l),
          city: null,
          region: null,
          country: raw.countries?.[i] ?? null,
        }))
      : [],
    workplace: allowed("workplace") ? (raw.workplace ?? "unknown") : "unknown",
    remoteEligibility: allowed("remoteEligibility")
      ? (raw.remoteEligibility ?? [])
      : [],
    employmentType: allowed("employmentType")
      ? employmentType(raw.employmentType)
      : null,
    seniority: null,
    salary: allowed("salary") ? (raw.salary ?? null) : null,
    postedAt: allowed("postedAt") ? (raw.postedAt ?? null) : null,
    postedAtBasis: allowed("postedAt") && raw.postedAt ? "source" : "unknown",
    sourceUpdatedAt: allowed("sourceUpdatedAt")
      ? (raw.sourceUpdatedAt ?? null)
      : null,
    validThrough: allowed("validThrough") ? (raw.validThrough ?? null) : null,
    firstSeenAt: now,
    lastSeenAt: now,
    lastVerifiedAt: now,
    missingSince: null,
    status: "active",
    stale: false,
    canonicalUrl: url,
    applyUrl,
    excerpt: allowed("excerpt")
      ? text(raw.text ?? "").slice(0, 320) || null
      : null,
    observations: [
      {
        sourceId: source.id,
        sourceJobId: raw.sourceJobId,
        sourceUrl: url,
        firstSeenAt: now,
        lastSeenAt: now,
        consecutiveMissing: 0,
        status: "active",
        stale: false,
      },
    ],
    contentHash: "",
    synthetic,
    attribution: source.approval.attribution,
    possibleDuplicateIds: [],
  };
  const result = jobSchema.parse(value);
  result.contentHash = materialHash(result);
  return result;
}

function employmentType(value: string | null | undefined): string | null {
  if (!value) return null;
  const k = value.toLowerCase().replace(/[ _-]/g, "");
  return (
    (
      {
        fulltime: "Full-time",
        parttime: "Part-time",
        contract: "Contract",
        temporary: "Temporary",
        intern: "Internship",
        internship: "Internship",
      } as Record<string, string>
    )[k] ?? text(value)
  );
}

export function materialHash(job: Job): string {
  return hash(
    JSON.stringify([
      job.title,
      job.company,
      job.locations,
      job.workplace,
      job.remoteEligibility,
      job.employmentType,
      job.salary,
      job.excerpt,
      job.relevance,
      job.canonicalUrl,
      job.applyUrl,
    ]),
  );
}
