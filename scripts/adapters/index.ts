import { z } from "zod";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { RawJob, Source } from "../../shared/schema";
import { date, text } from "../../shared/normalize";
import { HttpClient } from "../http";
export type AdapterResult = {
  records: RawJob[];
  complete: boolean;
  coverage: "exhaustive" | "search";
  warnings: string[];
};
export type Getter = (
  url: string,
  format?: "json" | "text",
) => Promise<unknown>;
const id = z.union([z.string().min(1), z.number()]).transform(String);
const ghSchema = z.object({
  jobs: z.array(
    z.object({
      id,
      internal_job_id: z.union([z.number(), z.string()]).nullable(),
      title: z.string().min(1),
      absolute_url: z.string().url(),
      content: z.string().optional(),
      location: z.object({ name: z.string() }),
      updated_at: z.string().optional(),
    }),
  ),
});
export async function greenhouse(
  source: Source,
  get: Getter,
): Promise<AdapterResult> {
  const data = ghSchema.parse(
    await get(
      `https://boards-api.greenhouse.io/v1/boards/${source.board}/jobs?content=true`,
    ),
  );
  return {
    records: data.jobs
      .filter((j) => j.internal_job_id !== null)
      .map((j) => ({
        sourceJobId: j.id,
        title: j.title,
        company: source.name,
        url: j.absolute_url,
        text: text(j.content ?? ""),
        locations: [j.location.name],
        sourceUpdatedAt: date(j.updated_at),
      })),
    complete: true,
    coverage: "exhaustive",
    warnings: [],
  };
}
const leverSchema = z.array(
  z.object({
    id,
    text: z.string().min(1),
    hostedUrl: z.string().url(),
    applyUrl: z.string().url(),
    descriptionPlain: z.string().optional(),
    description: z.string().optional(),
    lists: z
      .array(z.object({ text: z.string(), content: z.string() }))
      .optional(),
    categories: z
      .object({
        location: z.string().optional(),
        commitment: z.string().optional(),
        allLocations: z.array(z.string()).optional(),
      })
      .optional(),
    workplaceType: z.string().optional(),
    salaryRange: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
        currency: z.string().optional(),
        interval: z.string().optional(),
      })
      .optional(),
  }),
);
export async function lever(
  source: Source,
  get: Getter,
): Promise<AdapterResult> {
  const records: RawJob[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < source.requestPolicy.maxPages; page++) {
    let data: z.infer<typeof leverSchema>;
    try {
      data = leverSchema.parse(
        await get(
          `https://${source.region === "eu" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${source.board}?mode=json&skip=${page * 100}&limit=100`,
        ),
      );
    } catch (error) {
      if (records.length)
        return {
          records,
          complete: false,
          coverage: "exhaustive",
          warnings: ["Pagination interrupted; prior observations retained"],
        };
      throw error;
    }
    for (const j of data) {
      if (seen.has(j.id))
        return {
          records,
          complete: false,
          coverage: "exhaustive",
          warnings: ["Repeated pagination record"],
        };
      seen.add(j.id);
      records.push({
        sourceJobId: j.id,
        title: j.text,
        company: source.name,
        url: j.hostedUrl,
        applyUrl: j.applyUrl,
        text: text(
          `${j.descriptionPlain ?? j.description ?? ""} ${(j.lists ?? []).map((l) => l.content).join(" ")}`,
        ),
        locations:
          j.categories?.allLocations ??
          (j.categories?.location ? [j.categories.location] : []),
        employmentType: j.categories?.commitment ?? null,
        workplace: workplace(j.workplaceType),
        salary: j.salaryRange ? compensation(j.salaryRange) : null,
      });
    }
    if (data.length < 100)
      return { records, complete: true, coverage: "exhaustive", warnings: [] };
  }
  return {
    records,
    complete: false,
    coverage: "exhaustive",
    warnings: ["Page cap reached"],
  };
}
export function workplace(
  v: unknown,
): "remote" | "hybrid" | "onsite" | "unknown" {
  const s = String(v ?? "")
    .toLowerCase()
    .replace(/[ -]/g, "");
  return s === "remote" || s === "hybrid" || s === "onsite" ? s : "unknown";
}
function compensation(v: {
  min?: number;
  max?: number;
  currency?: string;
  interval?: string;
}): NonNullable<RawJob["salary"]> {
  return {
    min: v.min ?? null,
    max: v.max ?? null,
    currency: v.currency ?? null,
    interval: /^(year|annual|annually|yearly)$/i.test(v.interval ?? "")
      ? "year"
      : /^(hour|hourly)$/i.test(v.interval ?? "")
        ? "hour"
        : /^(month|monthly)$/i.test(v.interval ?? "")
          ? "month"
          : "unknown",
    kind: "employer_stated",
    raw: null,
  };
}
const ashbySchema = z.object({
  jobs: z.array(
    z.object({
      id,
      title: z.string().min(1),
      isListed: z.boolean(),
      jobUrl: z.string().url(),
      applyUrl: z.string().url(),
      descriptionPlain: z.string().optional(),
      location: z.string().optional(),
      secondaryLocations: z
        .array(z.object({ location: z.string() }))
        .optional(),
      workplaceType: z.string().optional(),
      employmentType: z.string().optional(),
      publishedAt: z.string().optional(),
      compensation: z
        .object({ compensationTierSummary: z.string().optional() })
        .passthrough()
        .nullable()
        .optional(),
    }),
  ),
});
export async function ashby(
  source: Source,
  get: Getter,
): Promise<AdapterResult> {
  const data = ashbySchema.parse(
    await get(
      `https://api.ashbyhq.com/posting-api/job-board/${source.board}?includeCompensation=true`,
    ),
  );
  return {
    records: data.jobs
      .filter((j) => j.isListed)
      .map((j) => ({
        sourceJobId: j.id,
        title: j.title,
        company: source.name,
        url: j.jobUrl,
        applyUrl: j.applyUrl,
        text: j.descriptionPlain,
        locations: [
          j.location,
          ...(j.secondaryLocations ?? []).map((l) => l.location),
        ].filter((l): l is string => !!l),
        workplace: workplace(j.workplaceType),
        employmentType: j.employmentType,
        postedAt: date(j.publishedAt),
        salary: j.compensation?.compensationTierSummary
          ? {
              min: null,
              max: null,
              currency: null,
              interval: "unknown",
              kind: "employer_stated",
              raw: text(j.compensation.compensationTierSummary),
            }
          : null,
      })),
    complete: true,
    coverage: "exhaustive",
    warnings: [],
  };
}
const ldSchema = z.object({
  "@type": z.union([z.string(), z.array(z.string())]),
  title: z.string().min(1),
  description: z.string().optional(),
  url: z.string().optional(),
  identifier: z.union([z.string(), z.object({ value: id })]).optional(),
  hiringOrganization: z.object({ name: z.string() }).optional(),
  datePosted: z.string().optional(),
  validThrough: z.string().optional(),
  employmentType: z.union([z.string(), z.array(z.string())]).optional(),
  jobLocationType: z.string().optional(),
  jobLocation: z.unknown().optional(),
});
export function parseCareerPage(html: string, source: Source): RawJob[] {
  const objects: unknown[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o["@graph"]) visit(o["@graph"]);
      if ([o["@type"]].flat().includes("JobPosting")) objects.push(o);
    }
  };
  for (const tag of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      visit(JSON.parse(tag[1]));
    } catch {
      throw new Error("Malformed JobPosting JSON-LD");
    }
  }
  if (!objects.length)
    throw new Error("No JobPosting structured data; parser review required");
  return objects.map((v) => {
    const j = ldSchema.parse(v);
    const url = new URL(j.url ?? "", source.url).toString();
    const locations = [j.jobLocation ?? []]
      .flat()
      .map((l) => {
        if (!l || typeof l !== "object") return "";
        const a = (l as Record<string, unknown>).address as
          | Record<string, unknown>
          | undefined;
        return a
          ? [a.addressLocality, a.addressRegion, a.addressCountry]
              .filter((x) => typeof x === "string")
              .join(", ")
          : "";
      })
      .filter(Boolean);
    if (
      (j.datePosted && !date(j.datePosted)) ||
      (j.validThrough && !date(j.validThrough))
    )
      throw new Error("Invalid JobPosting date");
    return {
      sourceJobId:
        typeof j.identifier === "string"
          ? j.identifier
          : (j.identifier?.value ?? url),
      title: j.title,
      company: source.name,
      url,
      text: text(j.description ?? ""),
      locations,
      postedAt: date(j.datePosted),
      validThrough: date(j.validThrough),
      workplace: j.jobLocationType === "TELECOMMUTE" ? "remote" : "unknown",
      employmentType: [j.employmentType ?? []].flat().join(", ") || null,
    };
  });
}
export async function careerPage(
  source: Source,
  get: Getter,
): Promise<AdapterResult> {
  return {
    records: parseCareerPage(String(await get(source.url!, "text")), source),
    complete: false,
    coverage: "search",
    warnings: ["Single reviewed page; absence does not establish closure"],
  };
}
export async function approvedFeed(
  source: Source,
  get: Getter,
): Promise<AdapterResult> {
  const value = String(await get(source.url!, "text"));
  if (
    /<!DOCTYPE|<!ENTITY/i.test(value) ||
    XMLValidator.validate(value) !== true
  )
    throw new Error("Invalid or unsafe feed XML");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  }).parse(value) as Record<string, unknown>;
  const rss = (parsed.rss as { channel?: { item?: unknown } } | undefined)
    ?.channel;
  const atom = parsed.feed as { entry?: unknown } | undefined;
  if (!rss && !atom) throw new Error("Not a supported RSS/Atom feed");
  const items = rss ? rss.item : atom?.entry;
  const records = (items ? [items].flat() : []).map((item) => {
    const j = z
      .object({
        title: z.string(),
        link: z.unknown(),
        guid: z.unknown().optional(),
        id: z.string().optional(),
        description: z.string().optional(),
        summary: z.string().optional(),
        pubDate: z.string().optional(),
        published: z.string().optional(),
      })
      .parse(item);
    const links = [j.link].flat();
    const link = links.find(
      (v) =>
        typeof v === "string" ||
        (v &&
          typeof v === "object" &&
          ["alternate", undefined].includes(
            (v as Record<string, string>)["@_rel"],
          )),
    );
    const href =
      typeof link === "string"
        ? link
        : (link as Record<string, string> | undefined)?.["@_href"];
    if (!href) throw new Error("Feed item has no job link");
    const url = new URL(href, source.url).toString();
    return {
      sourceJobId: j.id ?? (typeof j.guid === "string" ? j.guid : url),
      title: text(j.title),
      company: source.name,
      url,
      text: text(j.description ?? j.summary ?? ""),
      postedAt:
        date(j.published) ??
        (j.pubDate && Number.isFinite(Date.parse(j.pubDate))
          ? new Date(j.pubDate).toISOString()
          : null),
    };
  });
  return {
    records,
    complete: true,
    coverage: "search",
    warnings: ["Feed window is non-exhaustive; absence never closes jobs"],
  };
}
export function getAdapter(
  source: Source,
  getter?: Getter,
): Promise<AdapterResult> {
  const hosts =
    source.type === "greenhouse"
      ? ["boards-api.greenhouse.io"]
      : source.type === "lever"
        ? [source.region === "eu" ? "api.eu.lever.co" : "api.lever.co"]
        : source.type === "ashby"
          ? ["api.ashbyhq.com"]
          : [new URL(source.url!).hostname];
  const client = new HttpClient(source, hosts);
  const get: Getter = getter ?? ((url, format) => client.get(url, format));
  return {
    greenhouse,
    lever,
    ashby,
    feed: approvedFeed,
    "career-page": careerPage,
  }[source.type](source, get);
}
