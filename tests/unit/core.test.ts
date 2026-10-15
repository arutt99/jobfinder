import { describe, it, expect } from "vitest";
import { match } from "../../shared/matching";
import { canonicalUrl, text, identity, date } from "../../shared/normalize";
import { jobSchema, personalSchema } from "../../shared/schema";
import { fixtureData, fixtureSource } from "../../scripts/fixtures";
import { sourceGate } from "../../scripts/policy";
import { normalizeJob } from "../../scripts/normalize-job";
import {
  filterJobs,
  defaults,
  filterQuery,
  loadFilters,
  isStale,
} from "../../src/lib/filter";
import {
  emptyState,
  mergePersonal,
  entryFor,
  readPersonal,
  savePersonal,
  csv,
  storageKey,
} from "../../src/lib/storage";
const now = "2026-10-15T14:00:00.000Z";
const { jobs } = fixtureData(now);
describe("explainable relevance", () => {
  it.each([
    [
      "Jira Administrator",
      "Administer Jira workflows, permissions and custom fields.",
      "strong",
    ],
    [
      "JSM Administrator",
      "Administer JSM service projects, workflows, permissions and request types.",
      "strong",
    ],
    [
      "Jira Service Desk Administrator",
      "Administer Jira Service Desk workflows and permissions.",
      "strong",
    ],
    [
      "Business Systems Engineer",
      "Own Jira administration workflows, permissions, custom fields and Jira Service Management integrations.",
      "related",
    ],
    [
      "Senior Atlassian Administrator",
      "Administer Atlassian Cloud workflows and permissions.",
      "strong",
    ],
    [
      "Atlassian Solutions Architect",
      "Design Atlassian Cloud migrations and workflows.",
      "related",
    ],
    ["Software Engineer", "Use Jira to track sprint tasks.", "weak"],
    ["Scrum Master", "Use Jira to track tasks.", "weak"],
    ["Project Manager", "Jira familiarity and SQL required.", "weak"],
    [
      "Software Engineer",
      "Own Jira administration workflows, permissions, custom fields and Jira Service Management integrations.",
      "related",
    ],
  ])("%s classifies as %s", (title, description, tier) => {
    const r = match(title, description);
    expect(r.relevance.tier).toBe(tier);
    expect(r.relevance.score).toBe(
      Math.max(
        0,
        Math.min(
          100,
          r.relevance.reasons.reduce((n, r) => n + r.points, 0),
        ),
      ),
    );
  });
  it("does not match misleading substrings or support skills alone", () => {
    expect(
      match("Jirassic park engineer", "Groovy SQL Forge reporting").relevance
        .score,
    ).toBe(0);
  });
  it("normalizes HTML, entities and Unicode", () => {
    expect(
      text("<p>Jira&nbsp; &amp; Ｃｌｏｕｄ</p><script>alert(1)</script>"),
    ).toBe("Jira & Cloud");
  });
  it("does not invent clearance or unknown dates", () => {
    const j = normalizeJob(
      {
        sourceJobId: "x",
        title: "Jira Administrator",
        company: "Example",
        url: "https://example.invalid/a",
        text: "No clearance required.",
      },
      fixtureSource(),
      now,
    );
    expect(j).not.toHaveProperty("clearanceRequired");
    expect(j.postedAt).toBeNull();
    expect(date("invalid")).toBeNull();
  });
});
describe("stable identity and safe contracts", () => {
  it("strips only known tracking parameters", () => {
    expect(
      canonicalUrl("https://example.com/job?utm_source=test&id=22&locale=en#x"),
    ).toBe("https://example.com/job?id=22&locale=en");
    expect(canonicalUrl("https://example.com/job?id=22")).not.toBe(
      canonicalUrl("https://example.com/job?id=23"),
    );
  });
  it("rejects unsafe and credentialed links", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "https://user:secret@example.com",
    ])
      expect(() => canonicalUrl(url)).toThrow();
  });
  it("namespaces IDs by adapter and board", () => {
    expect(identity("lever", "a", "1")).toBe(identity("lever", "a", "1"));
    expect(identity("lever", "a", "1")).not.toBe(identity("lever", "b", "1"));
  });
  it("validates every synthetic job and rejects unknown raw fields", () => {
    jobs.forEach((j) => expect(jobSchema.safeParse(j).success).toBe(true));
    expect(
      jobSchema.safeParse({ ...jobs[0], rawResponse: "private" }).success,
    ).toBe(false);
  });
  it("projects restricted description/location/salary to unknown", () => {
    const source = fixtureSource();
    source.approval.publicFields = [
      "title",
      "company",
      "canonicalUrl",
      "applyUrl",
      "derivedMetadata",
    ];
    const j = normalizeJob(
      {
        sourceJobId: "r",
        title: "Jira Administrator",
        company: "X",
        url: "https://example.invalid/job",
        text: "Administer Jira workflows.",
        locations: ["Secret place"],
        salary: jobs[0].salary,
      },
      source,
      now,
    );
    expect(j.excerpt).toBeNull();
    expect(j.locations).toEqual([]);
    expect(j.salary).toBeNull();
    expect(j.relevance.reasons[0].label).not.toContain("Secret");
  });
});
describe("source permission gate", () => {
  it("accepts a complete synthetic approval record", () =>
    expect(sourceGate(fixtureSource(), new Date(now))).toBeNull());
  it.each(["candidate", "manual_only", "blocked"] as const)(
    "blocks %s",
    (status) => {
      const s = fixtureSource();
      s.approval.status = status;
      expect(sourceGate(s, new Date(now))).toBeTruthy();
    },
  );
  it("blocks disabled, expired, missing fields and finite retention sources", () => {
    const s = fixtureSource();
    s.enabled = false;
    expect(sourceGate(s)).toBeTruthy();
    s.enabled = true;
    s.approval.reviewAfter = "2020-01-01T00:00:00.000Z";
    expect(sourceGate(s)).toBeTruthy();
    s.approval.reviewAfter = "2099-01-01T00:00:00.000Z";
    s.approval.publicFields = [];
    expect(sourceGate(s)).toBeTruthy();
    s.approval.publicFields = fixtureSource().approval.publicFields;
    s.approval.maxRetentionDays = 30;
    expect(sourceGate(s)).toContain("Git history");
  });
});
describe("composable filters", () => {
  it("uses OR within a group and AND across groups", () => {
    const f = {
      ...defaults,
      workplace: ["remote", "hybrid"],
      roles: ["Jira admin", "JSM"],
      location: "United States",
      includeUnknownLocation: false,
    };
    const r = filterJobs(jobs, f, emptyState(), Date.parse(now));
    expect(r.length).toBeGreaterThan(0);
    expect(
      r.every(
        (j) =>
          ["remote", "hybrid"].includes(j.workplace) &&
          j.roleFamilies.some((r) => ["Jira admin", "JSM"].includes(r)) &&
          j.locations.some((l) => l.raw.includes("United States")),
      ),
    ).toBe(true);
  });
  it("keeps remote geography unknown separate from worldwide", () => {
    const r = filterJobs(
      jobs,
      { ...defaults, workplace: ["remote"], eligibility: ["Worldwide"] },
      emptyState(),
      Date.parse(now),
    );
    expect(r.length).toBe(2);
    expect(r.every((j) => j.remoteEligibility.includes("Worldwide"))).toBe(
      true,
    );
  });
  it("does not compare currencies/intervals or treat unknown salary as zero", () => {
    const r = filterJobs(
      jobs,
      {
        ...defaults,
        salary: "100000",
        currency: "USD",
        interval: "year",
        includeUnknownSalary: false,
      },
      emptyState(),
      Date.parse(now),
    );
    expect(r.length).toBeGreaterThan(0);
    expect(
      r.every(
        (j) => j.salary?.currency === "USD" && j.salary.interval === "year",
      ),
    ).toBe(true);
    const unknown = jobs.find((j) => !j.salary)!;
    expect(
      filterJobs(
        [unknown],
        { ...defaults, salary: "999999", includeUnknownSalary: true },
        emptyState(),
        Date.parse(now),
      ),
    ).toHaveLength(1);
  });
  it("supports phrase/any/all and exclusions", () => {
    expect(
      filterJobs(
        jobs,
        { ...defaults, q: "zzunknown Jira", keywordMode: "any" },
        emptyState(),
        Date.parse(now),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      filterJobs(
        jobs,
        { ...defaults, q: "zzunknown Jira", keywordMode: "all" },
        emptyState(),
        Date.parse(now),
      ),
    ).toHaveLength(0);
    expect(
      filterJobs(
        jobs,
        {
          ...defaults,
          q: "jira administrator",
          keywordMode: "phrase",
          excluded: "northstar",
        },
        emptyState(),
        Date.parse(now),
      ).some((j) => j.company === "Northstar Digital"),
    ).toBe(false);
  });
  it("does not serialize tracking or private data into the URL", () => {
    const f = { ...defaults, q: "Jira", tracking: "applied" };
    expect(filterQuery(f)).toBe("q=Jira");
    expect(loadFilters("?q=Jira&tracking=applied").tracking).toBe("");
  });
  it("computes staleness even without a new deployment", () =>
    expect(isStale(jobs[0], Date.parse(now) + 49 * 3600000)).toBe(true));
  it("filters 5,000 synthetic jobs under 200 ms on this test machine", () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({
      ...jobs[i % jobs.length],
      id: `j-${i}`,
    }));
    const start = performance.now();
    const r = filterJobs(
      big,
      { ...defaults, q: "Jira", workplace: ["remote"] },
      emptyState(),
      Date.parse(now),
    );
    const ms = performance.now() - start;
    console.log(
      `5,000-record filter: ${ms.toFixed(1)} ms (${r.length} results)`,
    );
    expect(ms).toBeLessThan(200);
  });
});
describe("personal state and safe exports", () => {
  it("preserves newest update and migrates aliases", () => {
    const local = emptyState();
    local.entries.old = { ...entryFor(jobs[0]), note: "new", updatedAt: now };
    const incoming = emptyState();
    incoming.entries.current = {
      ...entryFor(jobs[0]),
      note: "old",
      updatedAt: "2026-10-14T00:00:00.000Z",
    };
    expect(
      mergePersonal(local, incoming, { old: "current" }).entries.current.note,
    ).toBe("new");
  });
  it("recovers corrupt and unavailable storage without changing it", () => {
    const store = { getItem: () => "{bad" };
    expect(readPersonal(store).warning).toBeTruthy();
    expect(readPersonal(null).state).toEqual(emptyState());
    expect(
      savePersonal(emptyState(), {
        setItem: () => {
          throw new Error("full");
        },
      }),
    ).toBe(false);
  });
  it("migrates pre-release version 0 state", () => {
    const old = { version: 0, jobs: { one: entryFor(jobs[0]) } };
    const result = readPersonal({
      getItem: (k) => (k === storageKey ? JSON.stringify(old) : null),
    });
    expect(result.warning).toBeNull();
    expect(result.state.entries.one).toBeDefined();
  });
  it("validates imports and rejects malicious job links", () => {
    expect(
      personalSchema.safeParse({ schemaVersion: 4, entries: {}, manual: [] })
        .success,
    ).toBe(false);
    expect(() =>
      mergePersonal(emptyState(), {
        schemaVersion: 1,
        entries: {
          one: {
            ...entryFor(jobs[0]),
            snapshot: { title: "X", company: "X", url: "javascript:evil()" },
          },
        },
        manual: [],
      }),
    ).toThrow();
  });
  it("quotes CSV and neutralizes spreadsheet formulas", () => {
    const output = csv([
      { ...jobs[0], title: '  =HYPERLINK("x")', company: "A, B\nC" },
    ]);
    expect(output).toContain('"\'  =HYPERLINK(""x"")"');
    expect(output).toContain('"A, B\nC"');
    expect(output).not.toContain("updatedAt");
  });
});

describe("recovery and explicit geographic filtering", () => {
  it("preserves original unreadable storage before intentional changes", () => {
    const values = new Map([[storageKey, "{unreadable"]]);
    const storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
    };
    expect(savePersonal(emptyState(), storage)).toBe(true);
    expect(values.get(`${storageKey}.recovery`)).toBe("{unreadable");
    expect(readPersonal(storage).warning).toBeNull();
  });
  it("selects multiple explicit countries, with unknowns controlled separately", () => {
    const r = filterJobs(
      jobs,
      {
        ...defaults,
        countries: ["United States", "Canada"],
        includeUnknownLocation: false,
      },
      emptyState(),
      Date.parse(now),
    );
    expect(r.length).toBeGreaterThan(0);
    expect(
      r.every((j) =>
        j.locations.some(
          (l) => l.country && ["United States", "Canada"].includes(l.country),
        ),
      ),
    ).toBe(true);
  });
});

describe("JSM acronym context", () => {
  it("does not confuse an unrelated acronym with Jira Service Management", () => {
    expect(
      match(
        "JSM Engineer",
        "Own JSM Java Session Manager workflows, permissions and custom fields.",
      ).relevance.tier,
    ).toBe("weak");
    expect(
      match(
        "JSM Engineer",
        "Configure JSM service projects, request types, permissions and ITIL integrations.",
      ).relevance.tier,
    ).toBe("strong");
  });
});
