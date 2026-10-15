# Atlassian JobScout — Codex Build Plan

**Edition:** Reconstructed, detailed implementation plan  
**Prepared:** October 15, 2026  
**Suggested repository:** `atlassian-jobscout`  
**Audience:** Codex implementing a personal job discovery dashboard

> Recovery note: The original `/mnt/data/Atlassian_JobScout_Codex_Build_Plan.md` was not accessible from the current workspace or the referenced conversation. This document is a fresh reconstruction, not a claim to reproduce the original byte for byte. The recoverable conversation establishes a personal app, GitHub Pages hosting, and an Atlassian administrator / Jira administrator / Jira Service Management job focus. Other choices below are proposed defaults, not recovered user preferences.

## 1. Product outcome

Build a personal dashboard that regularly discovers relevant Atlassian ecosystem jobs, explains why each job matches, supports useful filters, and links to the employer's application page. Host the static dashboard on GitHub Pages and run collection and publishing through GitHub Actions.

The app should answer: **“Which newly discovered jobs involve administering, configuring, supporting, or implementing Jira, Jira Service Management, Confluence, or the Atlassian platform?”**

This searches for roles across employers, including consultancies and Atlassian partners. It is not restricted to jobs at Atlassian itself.

### Required first-release capabilities

- Discover jobs from an explicitly configured set of approved employer boards and permitted APIs or feeds.
- Match titles and responsibilities, rather than accepting every job that mentions Jira.
- Normalize, deduplicate, rank, and retain first-seen history across runs.
- Filter by role family, keywords, location, remote eligibility, employment type, source, recency, salary, and relevance.
- Show source health, collection time, coverage limits, and stale records clearly.
- Save, hide, and track jobs locally in the browser; support a personal JSON backup.
- Open original postings and application links without submitting applications automatically.
- Work locally with fixtures before any credentials or live sources exist.
- Build, test, refresh, and deploy with documented GitHub workflows.

### Scope boundaries

No accounts, hosted database, paid service dependency, resume storage, automated applications, recruiter messaging, or AI API is required for version 1. Do not build an internet-wide crawler. A curated employer registry plus an optional licensed aggregator is the initial coverage model.

The default site contains public job metadata. Personal notes, application statuses, and saved lists stay in the current browser unless explicitly exported by the user. Cross-device synchronization is a later architecture decision.

## 2. Proposed defaults and configurable decisions

| Decision | Proposed default | Implementation rule |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | Static output; no server runtime on Pages |
| Collector | TypeScript command-line programs | Share schemas and matching logic with frontend |
| Runtime | Supported Node.js LTS | Select and record an exact supported major at scaffolding; use the same major locally and in CI |
| Validation | Zod or equivalent | Validate external responses and published snapshots |
| Tests | Vitest, Testing Library, Playwright | Fixtures for normal CI; opt-in live probes |
| Schedule | Every 6 hours, minute 17 | `17 */6 * * *`, interpreted in UTC in this plan |
| Geography | No hard country restriction | Offer configurable presets; do not invent the user's residence or eligibility |
| Remote | Show remote, hybrid, onsite, unknown | Do not infer worldwide eligibility from “remote” |
| Salary | No minimum initially | Unknown amounts remain eligible |
| Strong-match threshold | 65 / 100 | Proposed heuristic, adjustable in config |
| Related-match threshold | 40 / 100 | Display separately or through a toggle |
| Persistence | Dedicated Git `data` branch | Durable, approved public metadata only |
| Personal state | Versioned browser local storage | Export/import; no GitHub token in the browser |
| Public description | Short permitted excerpt or none | Link to original; full text may be processed transiently if allowed |

Use a package lockfile and deterministic installation. Verify current package and action compatibility during implementation; this plan does not prescribe unverified “latest” versions.

## 3. Architecture and data flow

```text
config/sources.json + config/search-profile.json
                         |
              GitHub Actions / local CLI
                         |
            source registry + permission checks
                         |
     API adapters / approved feeds / approved career pages
                         |
     validate -> normalize -> match -> deduplicate -> merge
                         ^                              |
                         |                              v
               prior data-branch snapshot       candidate snapshot
                                                        |
                                      tests + quality/publication gates
                                                        |
                                  save snapshot to data branch
                                                        |
                                 build static dashboard + snapshot
                                                        |
                                           GitHub Pages artifact
                                                        |
                                             browser dashboard
                                                        |
                                   local saved jobs / statuses / notes
```

### Key architectural rules

1. Collection happens in Actions or locally. The browser fetches only same-origin static JSON; it does not query credentialed providers directly.
2. GitHub Pages serves files. It does not run a collector, receive form submissions, store user edits, or protect a secret embedded in JavaScript.
3. A complete snapshot is created in a temporary location, validated, and promoted atomically. Never overwrite the current dataset incrementally during network requests.
4. Durable history belongs in the `data` branch. Actions caches and temporary artifacts are conveniences, not the only copy of job history.
5. Build each deployment from a specific source commit and a specific data commit. Include both revisions in the manifest for diagnosis.
6. Publish only provider-permitted fields. Exclude credentials, raw response bodies, personal state, and full descriptions unless explicitly permitted.
7. A failed deployment leaves the previously deployed site available. A failed collection must not replace real jobs with an empty fixture dataset.

GitHub documents the custom Pages artifact/deployment flow and its deployment permissions in [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## 4. Job discovery strategy

### 4.1 Source permission and publication policy

Technical access and permission to republish are separate checks. An unauthenticated endpoint or a visible career page does not, by itself, establish permission for third-party aggregation. Before enabling a source, record the applicable documentation, terms or employer authorization, access method, permitted fields, attribution, retention, and review date. If unresolved, keep that source disabled and retain a manual link.

Use these source states:

- `candidate`: identified but unreviewed; no collection.
- `approved`: reviewed for the configured use; collection enabled when `enabled` is true.
- `manual_only`: external search or career link; no automated fetching.
- `blocked`: incompatible terms, denied access, or permission withdrawn.

For approved career-page extraction, check applicable robots instructions and terms. Robots permission is not a substitute for a separate publication-rights review. Stop on authentication requirements, access-denied responses, or challenges; do not add evasion or CAPTCHA handling.

These are source onboarding requirements, not a claim that every ATS board grants the same rights.

### 4.2 API adapters

| Adapter | Discovery model | Credential handling | Delivery priority |
| --- | --- | --- | --- |
| Greenhouse Job Board | Known employer `board_token` | Documented public GET endpoints; permission review still required | First |
| Lever Postings | Known employer site slug and global/EU region | Read public posting endpoint; verify current use terms | First |
| Ashby Job Postings | Known employer job-board name | Public posting endpoint; omit unlisted jobs | Second |
| Approved employer feed | Configured RSS/Atom/JSON feed | Only if the feed's use permits this app | Second |
| Approved career page | Explicit allowlisted employer page | No login; narrowly scoped parser | Second |
| Adzuna or another licensed aggregator | Keyword/country searches under an approved account | Actions secrets; optional | Later |

**Greenhouse:** Start with `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true`. Map post ID, title, location, original URL, and available text. The documented public GET endpoints do not require authentication. Do not treat `updated_at` as a posting date; use a distinct field. Handle null `internal_job_id` prospect/talent-pool posts separately. Reference: [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html).

**Lever:** Use `GET https://api.lever.co/v0/postings/{site}?mode=json&skip=0&limit=100`; select the documented EU host for EU boards. Implement `skip`/`limit` pagination and map categories, description text, hosted URL, and apply URL. Never call the application-submission endpoint. Reference: [Lever Postings API](https://github.com/lever/postings-api).

**Ashby:** Use `GET https://api.ashbyhq.com/posting-api/job-board/{board_name}?includeCompensation=true`. Include only listed postings; explicitly exclude `isListed: false`. Keep missing location and compensation fields unknown. Map source publication time, workplace type, job URL, and apply URL when supplied. Reference: [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api).

**Optional aggregator:** Adzuna documents keyword/location search with an application ID and key. Implement only after confirming the account's current terms, quotas, attribution, caching, and public-display rights. Treat estimated compensation distinctly from employer-stated compensation. Use HTTPS and redact query-string credentials from errors. Reference: [Adzuna search API](https://developer.adzuna.com/docs/search).

These employer APIs enumerate configured boards; they do not automatically discover every employer using the ATS. The dashboard must describe that coverage limit.

### 4.3 Career sites without a suitable API

For individually approved sites, prefer structured feeds, then `JobPosting` JSON-LD, then a small site-specific HTML parser. Extract only the approved paths and fields. Parse JSON-LD arrays and `@graph`, resolve relative links, validate `datePosted` / `validThrough`, and preserve multiple locations.

Use static HTTP fetching first. A browser-based adapter is optional only when the site explicitly permits the required automation and static extraction cannot work. Do not reverse-engineer undocumented ATS endpoints as the default strategy. Workday, iCIMS, SmartRecruiters, and custom sites require their own review and adapter; do not pretend one generic parser covers all of them.

Cap host requests, enforce same-host or reviewed redirect rules, set timeouts and response-size limits, and add parser fixtures. Missing selectors are a parser error, not proof that all jobs closed.

### 4.4 Google, Indeed, LinkedIn, and manual discovery

Provide **Open external search** buttons for user-initiated browsing. Build URLs from encoded query text, open them in a separate tab, and do not fetch or parse the results.

Suggested queries:

```text
"Jira Administrator"
"Atlassian Administrator"
"Jira Service Management" administrator
"Atlassian Engineer"
"Jira Consultant"
"Atlassian" "platform engineer"
site:boards.greenhouse.io "Jira Administrator"
site:jobs.lever.co "Atlassian"
site:jobs.ashbyhq.com "Jira Service Management"
```

Google's current terms restrict automated access that violates machine-readable instructions; this plan does not implement Google result scraping. See [Google Terms of Service](https://policies.google.com/terms?hl=en-US). Indeed's current terms restrict automated access without express permission, subject to its stated conditions; leave automated Indeed collection off unless a suitable approved arrangement exists. See [Indeed Terms of Service](https://www.indeed.com/legal?hl=en_US). LinkedIn remains manual-only in version 1.

A provider offering search results through its API still needs a terms and publication review; buying API access is not an automatic entitlement to republish every returned field.

Allow a user to save a manual job URL with a title/company entered locally. Saving it does not authorize server-side fetching. Manual entries remain browser-local and separate from the public snapshot.

### 4.5 Source registry example

The example is intentionally disabled and uses a fictitious employer. It is not evidence of a live board.

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "example-greenhouse",
      "name": "Example Employer",
      "type": "greenhouse",
      "board": "REPLACE_WITH_VERIFIED_BOARD_TOKEN",
      "enabled": false,
      "approval": {
        "status": "candidate",
        "reviewedAt": null,
        "reviewAfter": null,
        "documentationUrl": "https://docs.greenhouse.io/job-board.html",
        "termsUrl": null,
        "permissionBasis": null,
        "publicFields": [],
        "attribution": null,
        "maxRetentionDays": null
      },
      "requestPolicy": {
        "maxConcurrent": 1,
        "minDelayMs": 1500,
        "timeoutMs": 20000,
        "maxPages": 20,
        "maxResponseBytes": 5000000
      }
    }
  ]
}
```

An approved source must populate the permission fields with actual evidence and an explicit permitted field list; a generic documentation link alone is insufficient. These request limits are proposed conservative app defaults, not provider-advertised limits. Stricter provider requirements take precedence.

Start with a small, verified employer list: relevant consultancies, Atlassian partners, managed-service providers, and employers with internal Atlassian teams. Do not invent slugs or claim a target number of real listings before a live run.

## 5. Target roles and explainable relevance

### 5.1 Core role families

- Jira Administrator / Jira Admin / Jira System Administrator.
- Atlassian Administrator / Atlassian Systems Administrator.
- Jira Service Management Administrator / JSM Administrator.
- Atlassian Engineer / Jira Engineer / Atlassian Platform Engineer.
- Atlassian or Jira Consultant / Implementation Consultant.
- Confluence Administrator when the role also owns the Atlassian platform.
- Business Systems Administrator / ITSM Platform Administrator with clear Jira or JSM ownership.

Related roles, shown with a lower confidence tier, can include Atlassian solutions architects, migration specialists, platform support engineers, and ITSM consultants with substantial JSM responsibilities.

### 5.2 Positive evidence

Use boundary-aware, case-insensitive phrases and normalized aliases. Expand `JSM` with contextual checks, and recognize the former name `Jira Service Desk`.

- Administration: workflows, schemes, permissions, custom fields, issue types, screens, projects, user provisioning, SSO, SAML, SCIM, access governance.
- JSM: service projects, request types, portals, SLAs, queues, Assets / Insight, incident/change/problem management, ITIL, service catalogs.
- Platform: Atlassian Cloud, Data Center, migrations, organization/site administration, integrations, REST API, automation, Confluence.
- Supporting skills: ScriptRunner, Groovy, Forge, marketplace apps, SQL, reporting, backups, upgrades, troubleshooting.

Supporting skills alone must not make an unrelated role a strong match.

### 5.3 Proposed score

Implement a versioned deterministic rule engine. Scores are ranking heuristics, not probabilities or a claim of candidate qualification.

| Evidence | Points | Cap / handling |
| --- | --- | --- |
| Exact core administrator title | +50 | Title family bonus max 50 |
| Engineer / consultant / architect title with Atlassian or Jira | +35 | Alternative title bonus; do not add to exact administrator bonus |
| Explicit Jira/JSM/Atlassian administration responsibility | +25 | Once per job |
| Product-specific configuration evidence | +5 each | Max 15 |
| JSM ownership evidence | +10 | Once per job |
| Migration / integration / platform operations evidence | +5 | Once per job |
| Strongly unrelated title with only incidental Jira tool usage | -35 | Apply only when ownership evidence is absent |
| “Use Jira to track tasks” with no ownership evidence | -20 | Distinct from actual administration |

Clamp the result to 0–100. Strong: 65+, related: 40–64, weak: below 40. A description-only role can still qualify when explicit ownership plus several configuration signals exist. Keep user preference fit separate from role relevance: location and salary should filter or sort, not disguise what the role is.

Store each applied rule ID, points, and a short evidence phrase or approved excerpt. Render “Why this matched” with two or three concrete reasons. If description text cannot be published, display a derived tag such as “JSM administration responsibility” rather than reproducing restricted text.

### 5.4 Negative examples and overrides

- Software Engineer who uses Jira for sprint tracking: weak.
- Scrum Master who updates Jira boards: weak unless platform administration is explicit.
- Project Manager requesting Jira familiarity: weak.
- Business Systems Engineer owning Jira workflows and permissions: eligible despite a broad title.
- Senior Jira Administrator: strong; do not exclude seniority automatically.
- A job with “no clearance required”: do not flag as requiring clearance.

Use configurable exclusions and optional employer blocklists. Do not globally blacklist “developer,” “manager,” or “Scrum” when strong administration evidence is present. Missing compensation, remote eligibility, sponsorship, or clearance information remains unknown.

## 6. Data contracts and persistence

### 6.1 Normalized job

Define runtime schemas and TypeScript types for at least:

```typescript
type Job = {
  id: string;                    // Stable internal identity
  identityVersion: number;
  title: string;
  company: string;
  companyKey: string;
  roleFamilies: string[];
  locations: Array<{
    raw: string;
    city: string | null;
    region: string | null;
    country: string | null;
  }>;
  workplace: "remote" | "hybrid" | "onsite" | "unknown";
  remoteEligibility: string[];    // Explicit constraints only
  employmentType: string | null;
  seniority: string | null;
  salary: {
    min: number | null;
    max: number | null;
    currency: string | null;
    interval: "hour" | "month" | "year" | "unknown";
    kind: "employer_stated" | "estimated" | "unknown";
    raw: string | null;
  } | null;
  postedAt: string | null;
  postedAtBasis: "source" | "unknown";
  sourceUpdatedAt: string | null;
  validThrough: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastVerifiedAt: string | null;
  missingSince: string | null;
  status: "active" | "possibly_closed" | "closed" | "unknown";
  stale: boolean;
  canonicalUrl: string;
  applyUrl: string;
  excerpt: string | null;         // Only if public display is permitted
  tags: string[];
  relevance: {
    score: number;
    tier: "strong" | "related" | "weak";
    ruleVersion: string;
    reasons: Array<{ ruleId: string; points: number; label: string }>;
  };
  observations: Array<{
    sourceId: string;
    sourceJobId: string;
    sourceUrl: string;
    firstSeenAt: string;
    lastSeenAt: string;
    consecutiveMissing: number;
    status: "active" | "possibly_closed" | "closed" | "unknown";
    stale: boolean;
  }>;
  contentHash: string;            // Material normalized content, excludes run timestamps
};
```

Extend this contract for attribution and structured clearance/sponsorship evidence if implemented. Use `null` consistently for unknown scalar values, ISO 8601 UTC timestamps, and stable schema versions. Never use an invented date or zero salary as a substitute for unknown.

Raw text can exist in collector memory for matching where permitted; it is not automatically a field in the durable or public record. Explicitly review each additional output field against its source policy.

### 6.2 Identity and deduplication

1. Start from a namespaced source identity: adapter + board + source job ID. Generate the internal ID deterministically.
2. Merge observations with the same verified canonical URL after removing only known tracking parameters. Preserve parameters such as job IDs and locale when semantically significant.
3. Merge across sources only with strong evidence: a shared requisition identifier under the same employer, or an exact employer/title/location match plus matching destination or sufficiently similar content.
4. Fuzzy company/title similarity alone creates a possible-duplicate hint, not an automatic merge.
5. Prefer the direct employer destination when permitted; retain required provider links and attribution. Do not strip a licensed provider's required redirect parameters.
6. Preserve the existing internal ID when merging; store aliases from previous IDs so local bookmarks survive. Splits require an explicit migration policy.
7. Never collapse distinct requisitions merely because their titles match. Preserve multi-location postings and source observations.

### 6.3 Lifecycle rules

- `firstSeenAt` is the earliest actual observation and survives subsequent refreshes.
- `lastSeenAt` advances only when the job is observed again; run time alone does not refresh it.
- `lastVerifiedAt` advances after a successful relevant listing or approved detail check.
- An observation can be marked missing only after that source completes a full, valid enumeration. An error, blocked request, pagination cap, or malformed response is not a complete enumeration.
- Proposed default: two complete successful enumerations without the observation make it `possibly_closed`; three make it `closed`. Record when missing began. Explicit expiry or a confirmed removal can close it sooner.
- A search API returns a partial result set, not an employer's full inventory. Absence from a query page must never increment closure counters; use approved detail checks or mark the record stale/unknown.
- If one source still observes a merged job, it remains active. Do not let a failing secondary source close it.
- Proposed default: mark records from an unverified source stale after 48 hours. A full outage preserves prior jobs and displays old verification times.
- Keep closed records for a configurable default of 90 days only where source policy permits. Keep minimal ID aliases/tombstones only as permitted; otherwise remove and let browser state retain a local title/link snapshot.
- Reappearing source IDs reopen the same job and retain first-seen history. New requisition IDs produce new jobs unless verified as duplicates.

### 6.4 Snapshot files

```text
snapshot/
  manifest.json       schema version, data version, source/data commit, timestamps, counts, hashes
  jobs.json           approved normalized public job fields
  sources.json        safe source health and coverage metadata
  aliases.json        permitted stable-ID redirects
```

`manifest.json` includes `generatedAt`, `lastSuccessfulCollectionAt`, per-source success times, and `lastCompleteRefreshAt` separately. A newly generated manifest must not make old jobs appear freshly verified. Define complete refresh as all enabled sources completing their intended collection scope; search-only sources are scoped queries, not exhaustive web coverage.

Persist snapshots on the `data` branch with a bounded history policy and only commit on material data or health changes. The data branch is not a private store in a public repository. Do not commit raw responses or data that requires short-lived deletion; deleting the latest file does not remove old Git history. Use such sources only if a storage design meeting their retention terms is available.

If no previous snapshot exists, `--bootstrap` must be explicit. If prior state should exist but cannot be read, fail rather than silently resetting history. Tests must verify that empty registry and all-disabled registry are distinguished from a successful empty live board.

## 7. Dashboard specification

### 7.1 Main layout

1. Header: Atlassian JobScout, last successful collection, and source-health indicator.
2. Small count cards: active strong matches, related matches, newly discovered in 24 hours, locally saved, and stale records. Distinguish overall counts from filtered counts.
3. Search and filter panel with a visible reset button and active-filter chips.
4. Sortable job list; responsive cards on small screens and an optional table on larger screens.
5. Job details panel with match reasons, known requirements, provenance, original link, apply link, and local tracking controls.
6. Source coverage panel showing enabled boards, last attempts/successes, errors, and manual-only sources.
7. Settings and backup panel for browser-local preferences, imports, and exports.

Keep the visual design calm and readable. Use clear text labels rather than icon-only controls. Do not present the app as affiliated with Atlassian or an employer.

### 7.2 Filters and sorting

| Filter | Required behavior |
| --- | --- |
| Text | Title, employer, tags, approved excerpt; phrase and any/all keyword mode |
| Role family | Jira admin, Atlassian admin, JSM, engineering, consulting, related |
| Relevance | Strong / related / weak toggle and minimum score |
| Workplace | Remote, hybrid, onsite, unknown; separate from remote geography |
| Location | Multi-select country/region and free-text location; include-unknown toggle |
| Remote eligibility | Explicit worldwide / country / time-zone evidence; unknown remains separate |
| Employment | Full-time, part-time, contract, temporary, unknown |
| Salary | Minimum amount plus currency and interval; include-unknown toggle |
| Recency | Posted date or first seen, explicitly labeled; last 1/3/7/14/30 days |
| Sources | One or more configured boards/providers |
| Tracking | Unsaved, saved, applied, interviewing, offer, rejected, withdrawn, hidden |
| Lifecycle | Active, possibly closed, closed; stale toggle |
| Exclusions | User keywords or employers; show how many are excluded |

Use OR within a multi-select group and AND across groups. Default sort: role relevance descending, then first seen descending, then stable ID. Also offer newest posted, newest discovered, company, and comparable salary. Unknown dates and salaries sort last.

Do not compare USD annual salary with EUR hourly rates. Version 1 filters only comparable currencies/intervals. Any later annualization must disclose assumptions and preserve the original amount. Do not silently convert estimated salary into employer-stated pay.

Query-string filters may contain general search preferences. Do not place notes or application status in URLs. Date calculations use UTC instants and display the browser's timezone with clear labels.

### 7.3 Local personal state

Store a versioned object keyed by stable job ID containing saved/hidden flags, pipeline status, note, and update time. Keep a minimal local title/company/link snapshot so saved jobs remain understandable after leaving the public dataset.

Use defensive parsing and graceful fallback when storage is blocked, corrupt, or full. Provide JSON export/import with schema validation, a preview, and a documented merge rule: latest personal update wins; import does not overwrite a newer local change. Apply ID aliases before merging. Let the user export before a destructive local reset.

JSON personal backups are private user files and must not be uploaded into the public source registry or public data branch. CSV job export includes only currently displayed public fields, escapes quotes/newlines, and neutralizes spreadsheet formula prefixes in text fields.

### 7.4 Honest empty/error states

- No approved sources: setup instructions and fixture demo option, explicitly labeled.
- No relevant matches: explain that collection succeeded and offer related roles or broader filters.
- Filters remove all results: show reset and active filter counts.
- Partial source outage: retain data with per-source warning and verification dates.
- Full outage: keep last usable dataset and visibly show its age.
- Snapshot schema mismatch or corrupted download: readable error and retry; do not crash.
- Scheduled refresh overdue: compute staleness in the browser using manifest times, even when no new deployment occurs.

The dashboard's **Reload data** control only refetches the deployed snapshot. It does not run GitHub Actions. An optional owner link can open the repository's Actions page to run a manual refresh while authenticated on GitHub.

### 7.5 Accessibility and performance

Support keyboard operation, visible focus, semantic controls, labeled inputs, readable contrast, and accessible detail-panel behavior. Test at narrow mobile width and standard desktop width. Respect reduced-motion settings.

Use indexed text or memoized filtering and paginate/virtualize only when necessary. Proposed acceptance target: filter 5,000 synthetic records in under 200 ms on the documented test machine, excluding network loading. Record actual measurements; do not claim the target was reached without testing.

## 8. Repository layout and command contract

```text
atlassian-jobscout/
  .github/workflows/
    ci.yml
    refresh-and-deploy.yml
  config/
    sources.example.json
    sources.json
    search-profile.json
    scoring-rules.json
  src/
    app/
    components/
    features/jobs/
    features/filters/
    features/tracking/
    features/source-health/
    lib/storage.ts
    styles/
  shared/
    schemas/
    normalize/
    matching/
    identity/
  scripts/
    collect.ts
    validate-snapshot.ts
    quality-gate.ts
    stage-public-data.ts
    state-pull.ts
    state-push.ts
    adapters/
      greenhouse.ts
      lever.ts
      ashby.ts
      approved-feed.ts
      approved-career-page.ts
  tests/
    fixtures/
    unit/
    integration/
    e2e/
  docs/
    architecture.md
    source-policy.md
    operations.md
    decisions.md
  public/
    data/                 generated locally; ignored in source branch
  work/                   ignored collection state and diagnostics
  .env.example            variable names only
  .gitignore
  .nvmrc
  AGENTS.md
  README.md
  package.json
  package-lock.json
  vite.config.ts
  tsconfig.json
```

No real credentials or personal state in fixtures. Use synthetic job descriptions or appropriately licensed/redacted fixtures. Mark every demo record as synthetic and ensure production publishing cannot silently include it.

Implement these scripts with documented arguments and exit codes:

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
npm run collect -- --fixtures --output work/candidate
npm run collect -- --live --state work/previous --output work/candidate
npm run data:validate -- --input work/candidate
npm run data:quality -- --previous work/previous --candidate work/candidate
npm run data:stage -- --input work/candidate
npm run build
npm run preview
```

`data:stage` copies only explicitly permitted public files to `public/data`. `state:pull` and `state:push` handle the dedicated branch with deterministic file paths and no secret-bearing output. Define scripts in `package.json`; do not document commands that do not exist.

## 9. GitHub Actions and deployment design

### 9.1 Pull-request and source CI: `ci.yml`

- Trigger on `pull_request` and source changes pushed to the default branch.
- Default permission: `contents: read`.
- Install the pinned runtime and dependencies from the lockfile.
- Run lint, type checking, unit tests, fixture integration tests, production build, and browser smoke tests.
- Use fixture snapshots only; no live providers, source secrets, deployments, or data-branch writes.
- Test both `/` and a repository subpath such as `/atlassian-jobscout/`.
- Upload failure diagnostics without cookies, credentials, or private notes.
- Do not use `pull_request_target` to execute untrusted pull-request code with secrets.

### 9.2 Refresh and publish: `refresh-and-deploy.yml`

Use this trigger shape as a starting point; integrate verified, pinned action references during implementation:

```yaml
name: Refresh jobs and deploy dashboard
on:
  schedule:
    - cron: '17 */6 * * *'
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: jobscout-refresh-and-deploy
  cancel-in-progress: false
```

Replace `main` if the repository uses a different default branch. The `data` branch must not trigger this workflow. Serialize the entire refresh/save/deploy chain so an older dataset cannot finish deploying after a newer one. Enforce default-branch-only execution for manual dispatch as well as pushes; a manual dispatch from another branch must not receive collection secrets or publish.

**Collect/build job:**

1. Check out the source revision and validated, pinned dependencies.
2. Pull the last accepted snapshot from `data`, recording its exact commit. Missing prior state fails unless this is an intentional bootstrap.
3. Read only approved enabled sources; resolve optional credentials from Actions secrets.
4. Collect into `work/candidate` with bounded network behavior and per-source results.
5. Normalize, match, merge observations, apply lifecycle rules, and validate output.
6. Run the quality gate and essential fixture tests. A malformed snapshot or suspicious mass deletion blocks promotion. An actual successful zero-job board can pass after source-level checks.
7. Persist accepted public metadata to `data`; grant `contents: write` only to the job performing this write. Push using a normal fast-forward and a compare-and-retry rule, not a force push.
8. Stage the accepted candidate, configure the Pages base path, and build `dist/`. Embed source/data revisions in the manifest.
9. Run production smoke tests against the built output and inspect for forbidden files or exposed secrets.
10. Package only `dist/` using GitHub's Pages artifact action.

**Deploy job:**

- Depend explicitly on the successful build job.
- Use the `github-pages` environment and its deployment URL output.
- Grant the required `pages: write` and `id-token: write` permissions to this job; keep collection secrets out of it.
- Deploy the already-tested artifact with the Pages deploy action.

Use `configure-pages`, `upload-pages-artifact`, and `deploy-pages` according to the [official custom-workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Resolve supported versions, pin actions to verified immutable commit SHAs, and annotate the release tags for maintainability.

Do not rely on a bot commit to trigger a second deployment workflow. The refresh workflow performs its own build and deployment after saving state. If separate workflows are introduced later, implement explicit revision-linked artifact handoff and trust checks.

### 9.3 Partial failures and quality gate

The collector returns per-source outcomes including `success`, `partial`, `failed`, `disabled`, and `blocked`, plus whether the result is an exhaustive enumeration. A source that hits a page limit is partial even if every requested page returned HTTP 200.

- Some sources fail: merge successful data, retain failed-source observations, mark health, and publish a clearly degraded snapshot if all data invariants pass.
- Every enabled source fails: do not advance collection-success timestamps or alter lifecycle state. Preserve the accepted jobs and publish only truthful health metadata if a validated prior snapshot is available; make the run's degraded outcome visible in its summary.
- No valid prior snapshot and no live success: fail and do not deploy a production dataset.
- Sudden job-count collapse: proposed threshold is a drop greater than 50% for a board that previously had at least 20 records. Quarantine that board's candidate observations, retain its prior state, and flag review; do not reset other healthy boards.
- A reviewed override may accept a legitimate large change through a clearly documented manual workflow input. It must not bypass schemas, source permission rules, or output safety checks.
- An empty successful board is different from an HTML login/challenge page, parser failure, or incomplete pagination.

### 9.4 Pages setup and URL handling

Enable repository Settings → Pages → Source: GitHub Actions. Set the production base path to `/atlassian-jobscout/` for a project site, or `/` for an account site/custom domain as appropriate. Derive asset and data URLs from the configured base; do not hardcode `/data/jobs.json`.

Prefer query-string state or hash routing for this single-page dashboard so refreshing a nested route does not produce a Pages 404. Test navigation, reload, and direct links on the actual repository subpath before release.

GitHub's [publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) explains the setup and notes that a private source repository does not automatically make a Pages site private. Treat the default deployment as public; use local-only operation or separately verified access-controlled hosting if privacy becomes required.

### 9.5 Schedule and operations

GitHub notes that scheduled runs can be delayed or dropped under load and run on the default branch. The proposed UTC schedule avoids the top of the hour; it is a collection target, not a delivery-time guarantee. See [workflow schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Public-repository scheduled workflows can be disabled after 60 days without repository activity. Document re-enabling and manual refresh in the runbook; do not add artificial keepalive commits. See [disabling and enabling workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

The run summary should report source counts, new/updated/closed jobs, stale jobs, duration, partial failures, data commit, and deployment result. Keep credential-bearing URLs and raw job responses out of logs. Set timeouts and record actual Actions/API usage before increasing frequency. Hosting availability, quotas, and costs depend on the user's current GitHub plan and source accounts; do not promise unlimited free operation.

## 10. Phased implementation backlog

Implement phases in order. Each phase produces a usable increment, appropriate tests, and updated documentation. Do not claim a phase complete when only scaffolding or placeholder data exists.

### Phase 0 — Establish constraints and scaffold

**Tasks**

- Create the TypeScript/Vite application, package scripts, lockfile, and runtime pin.
- Add the proposed repository structure, source registry schema, and search-profile config.
- Write `AGENTS.md` with project commands, architecture boundaries, and fixture/live separation.
- Record assumptions in `docs/decisions.md`; keep geography, compensation, and source credentials configurable.
- Add a synthetic fixture mode, accessible basic shell, and README setup.

**Acceptance:** A fresh install starts locally, tests run offline, and the fixture app builds under both root and project-site paths. No secrets are needed.

**Codex task prompt**

> Implement Phase 0 of this plan. Create a minimal working React/TypeScript/Vite project and shared configuration schemas. Use synthetic, clearly labeled fixture data. Add actual package scripts, a pinned supported runtime, README, and AGENTS.md. Verify local build, type checking, and one meaningful render smoke test. Record unresolved source access decisions without blocking fixture development.

### Phase 1 — Define contracts and matching engine

**Tasks**

- Implement schemas for jobs, source configuration, source outcomes, snapshots, and personal state.
- Implement text normalization, role aliases, scoring, evidence labels, and role families.
- Build a labeled synthetic corpus containing strong, related, incidental, and ambiguous examples.
- Implement conservative URL normalization and stable source identities.
- Keep scoring rules versioned and separate from UI components.

**Acceptance:** All labeled administrator examples classify as strong; incidental Jira usage is weak. Broad systems roles with clear ownership can qualify. All outputs validate and sorting is deterministic.

**Codex task prompt**

> Implement Phase 1. Build the shared schemas, stable identity helpers, and deterministic relevance engine. Add meaningful positive and negative fixtures, including Jira Service Desk aliases, broad-title administrators, incidental Jira usage, unknown fields, and negated clearance phrases. Explain every score through rule IDs. Run unit tests and report actual classification results.

### Phase 2 — Implement the first permitted adapters

**Tasks**

- Implement the source registry gate, HTTP client, request budget, retry policy, and safe diagnostics.
- Add Greenhouse and Lever adapters with fixture tests, pagination, and normalized output.
- Introduce the adapter result contract: records, coverage mode, completeness, warnings, and timing.
- Reject unapproved sources and unsupported regions/hosts before making network requests.
- Document how to verify and onboard a real employer board.

**Acceptance:** Fixture collection succeeds offline; disabled/unapproved sources cause no requests. Pagination reaches completion or reports partial. A malformed response cannot erase prior jobs. A live probe is optional and only uses explicitly approved configured boards.

**Codex task prompt**

> Implement Phase 2 using fixture HTTP responses by default. Add Greenhouse and Lever adapters behind the approved-source registry and shared safe HTTP client. Cover pagination, 429 Retry-After, bounded retries, timeout, invalid JSON, HTML challenge responses, and missing fields. Do not invent live employer slugs or claim source permission from public accessibility alone.

### Phase 3 — Persist, deduplicate, and manage lifecycle

**Tasks**

- Implement observation merge, stable aliases, canonical URL dedupe, and possible-duplicate hints.
- Implement first-seen preservation, per-source missing counters, reopening, stale flags, and retention.
- Build state pull/push helpers, atomic snapshot creation, checksums, and manifests.
- Implement source-level anomaly quarantine and publication-field projection.
- Make two consecutive fixture runs demonstrate durable history and closure behavior.

**Acceptance:** Repeated collection preserves IDs and first-seen dates; failures and partial searches do not close jobs. Direct employer and duplicate aggregator observations can merge without losing provenance. Public outputs contain only allowed fields.

**Codex task prompt**

> Implement Phase 3. Add durable snapshot merge, conservative deduplication, alias migration, lifecycle rules, and data-branch state helpers. Use isolated temporary Git repositories for state integration tests. Verify two-run persistence, failed-source preservation, incomplete enumeration, search-result non-exhaustiveness, confirmed closure, reopening, and a legitimate empty board.

### Phase 4 — Build the usable job dashboard

**Tasks**

- Implement responsive job cards/table, details, match reasons, source badges, and timestamps.
- Add composable filters, sorting, filter counts, reset, and query-string general preferences.
- Add source-health and coverage views, fresh/stale states, and accessible empty/error states.
- Add same-origin snapshot loading with schema validation and base-path support.

**Acceptance:** A user can identify a strong JSM match, inspect why it matched, filter to explicit remote eligibility, and open the original posting with keyboard-only navigation. Unknown values remain distinguishable.

**Codex task prompt**

> Implement Phase 4 as a complete fixture-backed dashboard. Build meaningful filters, explainable ranking, a details view, source health, and honest freshness labels. Ensure unknown salary/location/remote eligibility do not silently become false or zero. Test filter combination behavior and production loading under a repository subpath.

### Phase 5 — Add personal tracking and exports

**Tasks**

- Add saved, hidden, and application-stage controls with local notes.
- Add versioned persistence, aliases, migration, corrupt-storage recovery, and unavailable-storage fallback.
- Add personal JSON backup/restore with preview and conflict handling.
- Add safe filtered CSV export and browser-local manual URL entries.

**Acceptance:** Tracking survives reload; backup/import restores it; a job removed from the public dataset remains understandable locally. Personal state never appears in a build artifact or URL.

**Codex task prompt**

> Implement Phase 5. Keep all personal state in the browser, keyed by stable job ID with alias support. Add validated JSON backup/restore, safe CSV export, local manual entries, and graceful storage failure handling. Test migrations and newest-update conflict resolution. Do not add hosted accounts or place credentials in frontend code.

### Phase 6 — Add reviewed source coverage

**Tasks**

- Implement Ashby with unlisted-post exclusion and compensation handling.
- Add an approved feed adapter and one narrowly scoped career-page parser if a suitable approved source exists; otherwise deliver the fixture-tested adapter framework with the live source disabled.
- Add external-search shortcuts and manual source management documentation.
- Add an optional licensed aggregator only when account terms and credentials are available.
- Display actual enabled coverage and avoid global completeness claims.

**Acceptance:** Every enabled source has an explicit permission record and fixture tests. A source needing unavailable access is visibly disabled with setup instructions. New adapters do not change existing source identities.

**Codex task prompt**

> Implement Phase 6. Add the Ashby adapter, approved-feed support, and a constrained career-page adapter framework. Keep any unreviewed live source disabled. Add user-initiated external search links without automated result scraping. Document optional aggregator activation, attribution, storage limits, and secret setup. Report verified live coverage separately from fixture support.

### Phase 7 — Automate collection and deploy to Pages

**Tasks**

- Implement CI and the serialized refresh/build/deploy workflow with pinned actions.
- Configure data-branch permissions, default-branch guards, Pages environment, and artifact contents.
- Add bootstrap, manual refresh, partial-outage handling, and reproducible rollback instructions.
- Document every GitHub setting and optional secret the owner must provide.
- Run the complete fixture pipeline locally and in CI before approved live collection.

**Acceptance:** CI succeeds without provider credentials; approved live refresh preserves history across runs; a real Pages deployment loads its snapshot and assets under the published path. Deployment is incomplete until the URL is verified. If repository access is unavailable, finish the reviewable workflows and report the exact external setup still required.

**Codex task prompt**

> Implement Phase 7. Create fixture-based CI and a default-branch-only scheduled/manual refresh workflow that saves approved public state to a dedicated data branch, builds the static app, and deploys one tested Pages artifact. Use least job-level permissions and pinned verified action SHAs. Validate subpath URLs, failure preservation, and production artifact safety. Perform publishing only within the user's granted repository scope; report external access gaps accurately.

### Phase 8 — Release validation and maintenance handoff

**Tasks**

- Run the release test matrix below; fix all blocking defects.
- Review the enabled registry, live-data provenance, public-field projection, and source-health presentation.
- Verify the site on mobile and desktop and check keyboard accessibility.
- Write source onboarding, disable/pause, stale-data diagnosis, backup, and rollback runbooks.
- Record actual source coverage, successful collection time, deployment URL, and known limitations.

**Acceptance:** All required tests pass; no synthetic jobs appear as live jobs; personal state stays local; the owner can refresh, diagnose a failed source, export tracking, and roll back without reading the collector internals.

**Codex task prompt**

> Complete Phase 8. Run the release matrix, inspect the built site and deployed URL if available, and fix blocking issues. Deliver a concise handoff with actual test results, verified live sources, remaining disabled integrations, refresh instructions, rollback steps, and limitations. Distinguish completed local work from external deployment steps that have not been performed.

## 11. Required test matrix

Normal CI must be deterministic and offline for provider interactions. Live contract probes are optional, bounded, read-only, and separate from required checks.

| Area | Meaningful cases | Expected outcome |
| --- | --- | --- |
| Relevance | Exact admin title, JSM aliases, broad platform role, incidental Jira | Correct tier with rule evidence |
| Text | HTML entities, Unicode, case, missing descriptions, misleading substrings | Stable normalization, no accidental phrase match |
| Source gate | Candidate, blocked, expired review, disabled | No network collection |
| HTTP | 429/Retry-After, 5xx, timeout, 401/403, challenge HTML, oversized body | Bounded retry or stop; safe source outcome |
| Pagination | Multiple pages, repeated page, page cap, midstream failure | No loops; incomplete is explicit |
| Ashby | `isListed: false`, missing compensation, multiple locations | Unlisted omitted; unknowns preserved |
| Career parsing | JSON-LD arrays/@graph, invalid dates, selector drift, relative URL | Safe extraction or parser failure |
| Identity | Tracking params vs job-ID params, same title/different requisition | Correct stable identity and separation |
| Dedupe | Employer plus aggregator, fuzzy-only match, multiple locations | Provenance preserved; no speculative merge |
| History | Two runs, missing observations, reopening, data-branch read failure | First-seen and aliases preserved |
| Lifecycle | Partial API search, failed board, successful empty board | Only complete enumerations affect absence counters |
| Quality | Mass disappearance, all-source failure, legitimate zero jobs | Quarantine/preserve rather than empty replacement |
| Public output | Restricted text, raw responses, query secrets, personal data | Excluded from dataset and `dist/` |
| Filters | OR within/AND across, unknown salary, currency/interval mismatch | Predictable results and counts |
| Local state | Reload, ID alias, malformed JSON, storage blocked, import conflict | Recovery and personal-state preservation |
| Exports | Quotes, newlines, formula-like CSV values, malformed import | Safe export and validated import |
| Security | Script tags in titles, `javascript:` URLs, hostile HTML | Escaped text; unsafe links rejected |
| Routing | Root, repository subpath, reload with filters, missing snapshot | Correct assets/data and readable errors |
| Accessibility | Keyboard, focus return, labeled filters, contrast | Usable primary flow |
| Deployment | Failed build, failed publish, manual nondefault branch | Existing site preserved; unauthorized branch blocked |

Do not make every test a snapshot of implementation details. Prefer behavior tests for risks that could lose history, expose data, misclassify roles, or break publishing.

## 12. Security and operational guardrails

- Treat all job text, URLs, feed content, and configuration imports as untrusted input.
- Render plain text by default. If rich text is necessary, use an established sanitizer with a restrictive allowlist; never render provider HTML directly.
- Allow only HTTP(S) job links and use appropriate opener protections for external tabs. Collector fetches require stricter HTTPS host allowlists and redirect validation.
- Block localhost, private/link-local destinations, and arbitrary user-supplied fetch URLs in collectors. Manual URLs are local links, not instructions to the backend.
- Never execute instructions found in a job posting. No job content controls workflow commands, shell arguments, source policy, or secret access.
- Keep API keys exclusively in repository/environment secrets. Browser-exposed build variables are public; never put keys in a Vite public environment variable.
- Redact credentials from URLs before logging, including exception objects generated by HTTP clients.
- Set retry/page/time/size budgets. Honor stricter provider limits and `Retry-After`; stop on forbidden access.
- Use ordinary reviewed configuration changes to enable sources. Do not let public imports add collector hosts.
- Include required attribution and remove a source promptly if its permission basis changes. Respect policy-specific retention rather than assuming the default 90 days applies everywhere.
- Configure automated dependency update proposals and review workflow-action changes. Keep lockfiles and pinned actions current through reviewed updates.

## 13. Operations runbook outline

**Initial local use:** Install the recorded runtime, run `npm ci`, collect fixtures, stage data, then start the app. Demo labeling must remain visible.

**Enable a live source:** Identify the actual employer board, complete the permission/publication record, add redacted fixtures, run its adapter tests, enable it, and perform one bounded live collection. Review counts and provenance before publishing.

**Manual refresh:** Open GitHub Actions, run the default-branch refresh workflow, and inspect its summary. Reloading the dashboard alone does not collect new jobs.

**Broken adapter:** Disable that source, preserve its prior observations with stale labels, capture a redacted fixture, repair and test the parser, then re-enable after a successful probe.

**No new data:** Check last source success, failed Actions runs, schedule enablement, permission/credential status, quotas, and data-branch access. Do not delete history as a troubleshooting shortcut.

**Rollback code:** Revert the bad source commit and redeploy using a validated snapshot compatible with that code's schema.

**Rollback data:** Select a known-good data commit, validate it, and create a new recovery commit on `data`; do not rewrite branch history. Deploy the recovery snapshot and preserve the truthful older collection timestamps.

**Back up personal tracking:** Export personal JSON from each browser/device. Local state is not included in the public repository or Pages deployment and can be lost if browser storage is cleared.

## 14. Release definition of done

- [ ] Fixture mode works from a fresh clone without credentials.
- [ ] Core administrator/JSM matches are explainable and incidental Jira usage is suppressed.
- [ ] At least one real approved source is verified before claiming live job discovery.
- [ ] Every enabled source has recorded access/publication evidence and attribution rules.
- [ ] Stable IDs, first-seen history, aliases, and per-source lifecycle rules survive multiple runs.
- [ ] Failed or partial sources cannot silently close all jobs or erase the accepted dataset.
- [ ] Filters, unknown values, remote geography, salary units, and recency labels behave as specified.
- [ ] Saved jobs, notes, and application statuses remain browser-local and can be backed up.
- [ ] No credentials, personal state, raw responses, or unapproved full descriptions appear in `dist/`.
- [ ] CI passes with fixtures and no live-source credentials.
- [ ] Scheduled/manual refresh and state persistence are tested.
- [ ] Pages assets and snapshot load under the actual published base path.
- [ ] The deployed URL is verified before deployment is reported complete.
- [ ] Source coverage, freshness, outages, manual-only sources, and disabled optional integrations are visible.
- [ ] The README and operations runbook match commands and settings that actually exist.

## 15. Master Codex implementation prompt

Copy this prompt into a Codex chat with this file available in the project:

```text
Build Atlassian JobScout according to Atlassian_JobScout_Codex_Build_Plan.md.

Implement a personal React/TypeScript static dashboard hosted on GitHub Pages,
with TypeScript collectors run locally and by GitHub Actions. Focus on Jira
Administrator, Atlassian Administrator, Jira Service Management, platform
engineering, and closely related consulting roles across employers.

Work through the phases in order and deliver working increments. Start with
fixtures, shared runtime schemas, explainable relevance scoring, and stable
identities. Add approved-source adapters, durable data-branch snapshots,
conservative deduplication, failure-safe lifecycle handling, dashboard filters,
browser-local tracking, exports, CI, and deployment. Keep the app usable when
optional API credentials or live-source permissions are unavailable.

Use only explicitly approved automated sources. Keep unresolved career sites
and Google/Indeed/LinkedIn collection disabled; offer user-initiated external
search links. Do not infer publication rights from a public endpoint. Do not
invent real board slugs, live listings, verified permissions, or test results.

Keep secrets in Actions, personal tracking in the browser, and only approved
public metadata in the deployed snapshot. Preserve first-seen history across
runs. Distinguish exhaustive source enumeration from partial search results;
failed or partial collection must not mark jobs closed.

Follow repository instructions, document assumptions, use a lockfile and pinned
supported runtime/actions, and run meaningful tests for each increment. Verify
Pages repository-subpath loading. Report completed work, actual validation,
disabled integrations, and any external setup still needed. Do not claim a live
deployment unless the published URL has been checked.
```

## 16. Official reference links

These references were consulted for the reconstruction on October 15, 2026. Recheck provider terms, account entitlements, endpoints, and supported action versions when implementing or enabling a source.

- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages publishing-source configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub workflow schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub workflow disable/re-enable behavior](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Adzuna search API](https://developer.adzuna.com/docs/search)
- [Google Terms of Service](https://policies.google.com/terms?hl=en-US)
- [Indeed Terms of Service](https://www.indeed.com/legal?hl=en_US)

---

**Deliverable status:** This file is an implementation plan. The app, source approvals, repository, scheduled collection, and live deployment have not been created by generating this document.

