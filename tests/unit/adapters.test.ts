import { describe, it, expect, vi } from "vitest";
import { HttpClient, publicAddress } from "../../scripts/http";
import { fixtureSource } from "../../scripts/fixtures";
import {
  greenhouse,
  lever,
  ashby,
  approvedFeed,
  parseCareerPage,
  careerPage,
} from "../../scripts/adapters/index";
function response(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
function client(fetcher: typeof fetch, options = {}) {
  const source = fixtureSource();
  source.requestPolicy.minDelayMs = 0;
  return new HttpClient(source, ["api.example.com"], {
    fetch: fetcher,
    sleep: async () => {},
    resolve: async () => ["8.8.8.8"],
    ...options,
  });
}
describe("bounded HTTP", () => {
  it("honors Retry-After and retries 429/5xx", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({}, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValue(response({ ok: true }));
    const sleep = vi.fn(async () => {});
    expect(
      await client(fetcher, { sleep }).get("https://api.example.com/jobs"),
    ).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it("bounds attempts and refuses excessive Retry-After", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({}, 429, { "retry-after": "3600" }));
    await expect(client(f).get("https://api.example.com/jobs")).rejects.toThrow(
      "retry budget",
    );
    expect(f).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 302])("stops on HTTP %s", async (status) => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(response({}, status));
    await expect(
      client(f).get("https://api.example.com/jobs"),
    ).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("rejects HTML, challenge, malformed JSON and oversized responses", async () => {
    for (const r of [
      new Response("<html>sign in to continue</html>"),
      new Response("<html/>", { headers: { "content-type": "text/html" } }),
      new Response("{", { headers: { "content-type": "application/json" } }),
      new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": "99999999",
        },
      }),
    ])
      await expect(
        client(vi.fn<typeof fetch>().mockResolvedValue(r)).get(
          "https://api.example.com/jobs",
        ),
      ).rejects.toThrow();
  });
  it("bounds streamed bodies and handles network/timeouts safely", async () => {
    const s = fixtureSource();
    s.requestPolicy.maxResponseBytes = 1;
    const c = new HttpClient(s, ["api.example.com"], {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ a: 2 })),
      sleep: async () => {},
      resolve: async () => ["8.8.8.8"],
    });
    await expect(c.get("https://api.example.com/jobs")).rejects.toThrow(
      "byte limit",
    );
    await expect(
      client(
        vi
          .fn<typeof fetch>()
          .mockRejectedValue(new Error("sensitive query credential")),
      ).get("https://api.example.com/jobs"),
    ).rejects.toThrow("network unavailable");
  });
  it("rejects unreviewed hosts, redirects, private and mixed DNS destinations", async () => {
    const f = vi.fn<typeof fetch>();
    for (const u of [
      "http://api.example.com",
      "https://evil.example.com",
      "https://127.0.0.1/",
    ])
      await expect(client(f).get(u)).rejects.toThrow();
    await expect(
      client(f, { resolve: async () => ["8.8.8.8", "127.0.0.1"] }).get(
        "https://api.example.com",
      ),
    ).rejects.toThrow("Nonpublic");
    expect(f).not.toHaveBeenCalled();
    expect(publicAddress("::1")).toBe(false);
    expect(publicAddress("10.1.2.3")).toBe(false);
  });
});
describe("provider adapters", () => {
  it("Greenhouse excludes prospect posts and never treats updated_at as posted", async () => {
    const result = await greenhouse(fixtureSource(), async () => ({
      jobs: [
        {
          id: 1,
          internal_job_id: 100,
          title: "Jira Administrator",
          absolute_url: "https://example.invalid/job/1",
          location: { name: "Remote" },
          content: "<p>Administer Jira</p>",
          updated_at: "2026-10-14T00:00:00Z",
        },
        {
          id: 2,
          internal_job_id: null,
          title: "Talent pool",
          absolute_url: "https://example.invalid/job/2",
          location: { name: "" },
        },
      ],
    }));
    expect(result.records).toHaveLength(1);
    expect(result.records[0].postedAt).toBeUndefined();
    expect(result.records[0].sourceUpdatedAt).not.toBeNull();
  });
  it("fails a malformed board rather than treating it as empty", async () => {
    await expect(
      greenhouse(fixtureSource(), async () => ({ jobs: [{ title: "Bad" }] })),
    ).rejects.toThrow();
    expect(
      (await greenhouse(fixtureSource(), async () => ({ jobs: [] }))).complete,
    ).toBe(true);
  });
  it("Lever paginates with skip and limit and selects EU host", async () => {
    const s = fixtureSource("demo-lever", "lever");
    s.region = "eu";
    const get = vi
      .fn()
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, i) => ({
          id: `${i}`,
          text: "Jira Admin",
          hostedUrl: `https://example.invalid/${i}`,
          applyUrl: `https://example.invalid/apply/${i}`,
        })),
      )
      .mockResolvedValueOnce([]);
    const r = await lever(s, get);
    expect(r.complete).toBe(true);
    expect(r.records).toHaveLength(100);
    expect(get.mock.calls[1][0]).toContain("api.eu.lever.co");
    expect(get.mock.calls[1][0]).toContain("skip=100");
  });
  it("Lever reports repeated pages and page caps as incomplete", async () => {
    const s = fixtureSource("demo-lever", "lever");
    const page = Array.from({ length: 100 }, (_, i) => ({
      id: `${i}`,
      text: "Jira Admin",
      hostedUrl: `https://example.invalid/${i}`,
      applyUrl: `https://example.invalid/${i}`,
    }));
    expect((await lever(s, async () => page)).complete).toBe(false);
    s.requestPolicy.maxPages = 1;
    expect((await lever(s, async () => page)).warnings[0]).toContain("cap");
  });
  it("Ashby excludes unlisted jobs and preserves missing compensation", async () => {
    const j = {
      id: "a",
      title: "Atlassian Administrator",
      isListed: true,
      jobUrl: "https://example.invalid/a",
      applyUrl: "https://example.invalid/a/apply",
      location: "Toronto",
      secondaryLocations: [{ location: "London" }],
      workplaceType: "Remote",
    };
    const r = await ashby(fixtureSource("demo-ashby", "ashby"), async () => ({
      jobs: [j, { ...j, id: "b", isListed: false }],
    }));
    expect(r.records).toHaveLength(1);
    expect(r.records[0].salary).toBeNull();
    expect(r.records[0].locations).toEqual(["Toronto", "London"]);
    expect(r.records[0].workplace).toBe("remote");
  });
  it("parses JSON-LD arrays/@graph, multiple locations and relative URLs", () => {
    const source = fixtureSource();
    source.url = "https://example.invalid/careers";
    const j = {
      "@type": "JobPosting",
      title: "Jira Admin",
      url: "/careers/1",
      datePosted: "2026-10-14",
      jobLocation: [
        { address: { addressLocality: "London", addressCountry: "UK" } },
        { address: { addressLocality: "Paris" } },
      ],
    };
    const r = parseCareerPage(
      `<script type="application/ld+json">${JSON.stringify([{ "@graph": [j] }])}</script>`,
      source,
    );
    expect(r[0].url).toBe("https://example.invalid/careers/1");
    expect(r[0].locations).toHaveLength(2);
    expect(() =>
      parseCareerPage("<html>layout changed</html>", source),
    ).toThrow("parser review");
    expect(() =>
      parseCareerPage(
        `<script type="application/ld+json">${JSON.stringify({ ...j, datePosted: "bad" })}</script>`,
        source,
      ),
    ).toThrow("Invalid");
  });
  it("career page and feed never claim exhaustive absence", async () => {
    const s = fixtureSource();
    s.url = "https://example.invalid/jobs";
    const j = { "@type": "JobPosting", title: "Jira Admin", url: "/1" };
    const page = await careerPage(
      s,
      async () =>
        `<script type="application/ld+json">${JSON.stringify(j)}</script>`,
    );
    expect(page.coverage).toBe("search");
    expect(page.complete).toBe(false);
    const feed = await approvedFeed(
      s,
      async () =>
        "<rss><channel><item><title>Jira Admin</title><link>https://example.invalid/1</link><description>Administer Jira</description></item></channel></rss>",
    );
    expect(feed.coverage).toBe("search");
    expect(feed.records).toHaveLength(1);
  });
  it("supports Atom and rejects unsafe entities and format drift", async () => {
    const s = fixtureSource();
    s.url = "https://example.invalid/jobs";
    const r = await approvedFeed(
      s,
      async () =>
        '<feed><entry><title>Jira Admin</title><id>a</id><link href="/a" rel="alternate"/></entry></feed>',
    );
    expect(r.records[0].url).toBe("https://example.invalid/a");
    await expect(approvedFeed(s, async () => "<html/>")).rejects.toThrow();
    await expect(
      approvedFeed(s, async () => '<rss><!ENTITY x "bad"></rss>'),
    ).rejects.toThrow();
  });
});

describe("interrupted pagination", () => {
  it("retains valid Lever pages without claiming enumeration completed", async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      text: "Jira Admin",
      hostedUrl: `https://example.invalid/${i}`,
      applyUrl: `https://example.invalid/${i}`,
    }));
    const get = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error("outage"));
    const result = await lever(fixtureSource("demo-lever", "lever"), get);
    expect(result.records).toHaveLength(100);
    expect(result.complete).toBe(false);
    expect(result.warnings[0]).toContain("interrupted");
  });
});
