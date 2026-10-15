# Source approval and onboarding

The default registry `config/sources.json` is empty. `sources.example.json` is an intentionally disabled, fictitious example, not a real board or permission record.

For each actual employer:

1. Verify its documented ATS board identifier, region, or exact feed/page URL. Never guess a live slug.
2. Review applicable API/feed/site terms and employer authorization for automated access, transient description processing, and public display. For career pages, review current robots instructions too. Record real evidence in `permissionBasis`, `documentationUrl`, and `termsUrl`.
3. Choose `candidate`, `manual_only`, `blocked`, or `approved`. Only enabled approved records with a current review window pass the gate. Use ISO timestamps for `reviewedAt` and `reviewAfter`; schedule a review before expiry.
4. Explicitly enumerate permitted fields. Required core metadata: `title`, `company`, `canonicalUrl`, `applyUrl`, `derivedMetadata`. The latter authorizes stable IDs, derived tags/role families/scores, company keys, timestamps, content hashes, source observations and duplicate hints. Other opt-in fields: `locations`, `workplace`, `remoteEligibility`, `employmentType`, `salary`, `postedAt`, `sourceUpdatedAt`, `validThrough`, `excerpt`. Unpermitted optional fields are unknown/null/empty; descriptions are processed transiently only as authorized and excerpts are omitted unless opted in.
5. Record required public attribution. Confirm indefinite public Git-history storage is permitted (`allowGitHistory: true`, `maxRetentionDays: null`). Sources requiring deletion from historical copies cannot be enabled with this architecture; use a different storage design first. The app's 90-day closed-record UI retention does not erase old Git commits.
6. Keep serial requests (`maxConcurrent: 1`), choose stricter of provider limits and app limits, and add redacted/synthetic adapter fixtures. Requests have time, size, retry, page and delay budgets. Long Retry-After requests stop rather than being ignored. Redirects require a reviewed direct endpoint.
7. Run unit/integration tests, enable the record in a reviewed change, and perform one bounded live run with prior state. Review counts, public fields, attribution and provenance before publication.

Adapters:

- **Greenhouse:** public job-board GET API; ignores prospect/talent-pool records with null internal requisition ID. `updated_at` is separate from posting date. Board enumeration is exhaustive only after valid response parsing.
- **Lever:** documented global/EU hosts, skip/limit pagination, repeated-page detection and explicit incomplete status. Midstream failure retains valid earlier pages without closing absent jobs. Only posting reads, never application endpoints.
- **Ashby:** only `isListed: true` postings. Preserves multiple locations and source publication/workplace fields. Compensation summaries display as employer-stated text; numeric values remain unknown unless provided by a supported numeric contract. No inferred salary bands or worldwide remote inference.
- **RSS/Atom:** configured employer feed, no external XML entities/DOCTYPE, required item title/link, non-exhaustive window. An empty valid feed cannot close prior jobs.
- **Career page:** one reviewed static page, JobPosting arrays and @graph, relative job links, dates and multiple locations. Missing structured data is parser failure. It is a constrained search scope, so disappearance cannot close jobs. No general HTML scraper, headless evasion, undocumented Workday endpoint, or crawling exists.

Google, Indeed, and LinkedIn remain user-initiated external search links. Local manual links never authorize collector hosts. Adzuna/licensed aggregators are disabled/unimplemented until account quotas, attribution, caching, public-display rights, retention and secrets are actually available.

To withdraw permission, set `approval.status` to `blocked`, keep the record visible, and refresh. To pause a source during an outage, set `enabled: false`; prior records stay stale. Removing a source record or expiring its review also withdraws its retained public contribution; optional field permissions are reapplied even during outages. If a merged job has a blocked contribution, this conservative implementation removes the whole public job rather than risk retaining restricted fields; browser-local tracking survives.
