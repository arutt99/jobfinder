# Operations

## Refresh

Locally follow the README's state pull → collect → validate → quality → push → stage → build sequence. On GitHub, run **Refresh jobs and deploy dashboard** from the default branch. Bootstrap is for an intentionally missing branch only. A failed read, corrupt prior snapshot, authentication error or unexpected remote revision requires diagnosis, never reset.

Reload data in the dashboard refetches static files only. Check source coverage for attempts/successes, completeness and messages. The manifest distinguishes snapshot generation, last successful collection, and last complete scope refresh. A newer deployment can contain correctly stale jobs.

The run summary includes job/source counts, new/updated/closed/stale totals, collection duration, data commit and verified deployment URL. CI failures never deploy. A failed build/publish preserves the previously deployed site; durable data can already be ahead of the deployed artifact, and the next valid run resumes from it.

## No data / no new data

- Empty registry: no source collection occurred. Onboard a reviewed board, or run the explicit local demo.
- All enabled sources failed on bootstrap: collection fails; do not stage fixtures as recovery.
- Partial/full outage with valid prior state: prior observations remain, with source warnings and truthful verification dates. A total outage cannot advance successful-collection time.
- Unexpected count collapse: check `quarantined` source health and redacted fixtures. Only use the manual **accept_large_change** input after verifying the large removal is legitimate. This advances normal missing counters; it does not force immediate closure.
- Broken adapter: disable the source, preserve prior data, add a redacted parser fixture, repair and test, then re-enable. Keep permission review current.
- Stopped schedule: check failed Actions runs, default branch, Pages settings, permission review dates, quotas/network/credentials, and GitHub's inactivity disablement. Re-enable the scheduled workflow or dispatch manually. Do not add artificial activity commits.

## Personal backup

Settings & backup → **Export personal JSON** downloads a private file with saved/hidden state, stages, notes, local snapshots and manual entries. Back up each browser/device separately. Restore validates the file and previews counts before merging. Latest per-entry `updatedAt` wins (ties preserve existing local state); ID aliases apply first. Browser-local roles missing from public data remain listed in Saved roles or Applications.

Malformed or blocked/full storage produces a warning and an in-memory fallback. Do not clear storage before backing up useful tracking. The original malformed storage is preserved until an intentional recovery action; before new changes overwrite it, a recovery copy is saved. Settings can export original storage or that recovery copy. Use a clean browser profile and import a valid backup if browser storage remains unreadable. Clearing settings requires exporting a backup first and explicitly confirming reset. No cross-device sync is provided.

CSV exports contain currently filtered public role metadata only, with quotes/newlines escaped and spreadsheet formula prefixes neutralized. They do not contain notes or personal statuses.

## Pause / permission withdrawal

Disable an enabled source to pause fetching without pretending old jobs are current. Set permission status to `blocked` for withdrawal and refresh; its public contributions are conservatively removed. Historical data removal obligations need a storage design outside this Git-based first release; do not enable such a source in the first place.

## Code rollback

Revert the bad source commit with a new ordinary Git commit, validate a compatible data snapshot, then run the refresh/deploy workflow. Do not rewrite the data branch as a rollback strategy.

## Data rollback

Fetch the `data` branch and inspect a known-good commit. In a temporary checkout of the **current data branch**, restore only `manifest.json`, `jobs.json`, `sources.json`, `aliases.json` from the known-good revision. Validate with `npm run data:validate -- --input /absolute/path/to/recovery-checkout` using the source checkout's CLI. Preserve the old truthful collection timestamps. Commit a new recovery revision and push by ordinary fast-forward. Deploy a validated staged recovery artifact; a standard live refresh may immediately update it again. No force push or history deletion.

## Hosting and source access

This implementation has not changed repository settings, enabled real providers, or deployed. Repository Settings → Pages → GitHub Actions and default-branch merge/access are external setup. The workflow is public Pages by default; a private repository alone does not make Pages private. Optional provider credentials, if added later, belong in Actions secrets only. The current adapter set requires no provider keys. Never add `VITE_` secrets.
