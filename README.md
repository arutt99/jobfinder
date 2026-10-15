# Atlassian JobScout

A personal, static workspace for finding Jira, Jira Service Management, Confluence, and Atlassian platform roles across employers. Built with React, TypeScript, Vite, and a TypeScript collector; designed for GitHub Pages.

**Current coverage:** no live sources are enabled or verified. The included demo contains 14 synthetic roles, visibly labeled throughout. Greenhouse, Lever, Ashby, RSS/Atom, and constrained JobPosting JSON-LD adapters are fixture-tested. A scheduled live collection and a Pages deployment have not been performed.

## Start locally

Use Node **24** (the same major as CI):

```bash
nvm use
npm ci
npm run demo
npm run dev
```

Open the URL Vite prints. `npm run demo` explicitly generates and stages fixtures; there is no automatic fallback from live data to synthetic listings. Fonts are bundled locally and no remote job API is called by the browser.

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright uses `/usr/bin/chromium` when available, otherwise its installed Chromium. Override with `CHROMIUM_PATH`. To verify a project site locally:

```bash
VITE_BASE_PATH=/jobfinder/ npm run build
VITE_BASE_PATH=/jobfinder/ npm run test:e2e
```

## What works

- Explainable, deterministic relevance scores with rule IDs. An incidental Jira mention is insufficient; broad titles with explicit platform ownership can qualify as related roles.
- Search in all/any/phrase mode; role families, relevance, workplace, explicit remote geography, location, employment, salary currency/interval, recency/date basis, source, lifecycle, stale records, exclusions, and local tracking filters.
- Cards and table view, sortable results, details, collection timestamps, provenance, source health, and honest demo/stale/empty/error states.
- Browser-local saved/hidden roles, application stages, notes, manual links, JSON backup with preview/merge, and safe filtered CSV export. Newest personal update wins; aliases preserve bookmarks. Local tracking never enters URL filters or public datasets.
- Bounded, permission-gated source adapters, strict runtime schemas, public-field projection, SHA-256 snapshots, conservative deduplication, aliases, first-seen persistence, missing counters, reopening, quarantine, and full-outage preservation.
- Dedicated `data` branch helpers, offline provider tests, default-branch-only scheduled/manual collection, and GitHub Pages artifact deployment.

JobScout is independent and is not affiliated with Atlassian or an employer. Scores rank role relevance; they do not assess your qualifications. The app never applies to jobs, fetches user-entered links, or submits applications.

## Collect and validate

Fixture mode needs no credentials:

```bash
npm run collect -- --fixtures --output work/candidate
npm run data:validate -- --input work/candidate
npm run data:stage -- --input work/candidate --allow-fixtures
```

Live mode requires reviewed source configuration. To create an intentionally empty setup snapshot before onboarding:

```bash
npm run collect -- --live --bootstrap --output work/candidate
npm run data:validate -- --input work/candidate
npm run data:quality -- --candidate work/candidate
npm run data:stage -- --input work/candidate
```

An empty registry produces no jobs and **no successful-collection timestamp**. With enabled sources, an initial run with no successful source fails. Once durable history exists, always pull it; never use bootstrap to recover from a read error:

```bash
npm run state:pull -- --output work/previous
npm run collect -- --live --state work/previous --output work/candidate
npm run data:validate -- --input work/candidate
npm run data:quality -- --previous work/previous --candidate work/candidate
npm run state:push -- --input work/candidate --previous work/previous
npm run data:stage -- --input work/candidate
npm run build
npm run artifact:check
```

`state:pull`/`state:push` use `origin` by default; `--remote /path/to/bare.git` supports isolated local testing. A missing branch requires `state:pull --bootstrap`; the first push omits `--previous`. State helpers use normal fast-forward pushes and bounded retries; a changed remote head requires pulling and recollecting. They never force-push. Source policy must permit indefinite public Git-history storage; finite deletion requirements are rejected by this implementation.

Exit code 0 means success; invalid arguments, incompatible/corrupt snapshots, policy/bootstrap failures, and unsafe publication return nonzero. Provider failures are represented in source health when valid prior state permits a degraded snapshot. Full outage preserves successful timestamps and observations. Reload data in the app only refetches the deployed files.

## GitHub Pages setup

1. Review and merge the implementation into the repository's default branch. Workflows target `main`; edit the push branch if your default branch differs. Both workflow jobs also check the actual default branch for manual and scheduled runs.
2. In repository **Settings → Pages**, select **GitHub Actions** as the source. Allow the workflow to write repository contents for the `data` branch. Check protection rules permit the job's ordinary fast-forward data commits.
3. Complete source onboarding in [docs/source-policy.md](docs/source-policy.md), or intentionally leave the registry empty to publish the setup screen. No provider secret is required for the supplied adapters.
4. Manually run **Refresh jobs and deploy dashboard** from the default branch with **bootstrap** enabled for the first run only. Later runs leave it off.
5. The workflow pulls history, collects live configuration, validates/tests, persists state, stages a source/data revision, derives the Pages base path, builds and browser-tests the exact artifact, then deploys and checks its URL/manifest. Check its actual verified URL in the run summary before claiming deployment complete.

Collection targets `17 */6 * * *` **UTC**, every six hours; Actions can delay/drop scheduled runs. Public-repository schedules can stop after 60 days of inactivity. Re-enable the workflow or run it manually. No keepalive commits are generated.

The production workflow rejects fixtures. CI tests fixtures at both `/` and `/jobfinder/`, with no live providers, repository writes, or deployment. Action release refs were resolved to immutable SHAs during implementation; Dependabot proposes updates. Optional aggregators and their secrets are deliberately unimplemented pending approved terms and credentials.

## More detail

- [Architecture and invariants](docs/architecture.md)
- [Source approval and onboarding](docs/source-policy.md)
- [Operations, backup, and rollback](docs/operations.md)
- [Decisions and limits](docs/decisions.md)
- [Release validation](docs/validation.md)
- [Original build plan](Atlassian_JobScout_Codex_Build_Plan.md)
