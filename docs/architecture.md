# Architecture

```
config → source permission gate → bounded adapters
                                      ↓
previous public snapshot → normalize / score / project → merge / lifecycle / quarantine
                                      ↓
                       validate / checksums / quality gate
                                      ↓
                        data branch → Pages artifact → browser
                                                           ↓
                                              local personal state / private export
```

Shared Zod contracts live in `shared/schema.ts`; untrusted data is validated both before durable publication and in the browser. Provider HTML is converted to plain text; React escapes rendered content. Job links allow only HTTP(S) without embedded credentials. The collector permits HTTPS reviewed hosts, rejects private/link-local DNS destinations and IP literals, stops on redirects/challenges/denied access, and never fetches manual URLs. Host/DNS checks use ordinary platform DNS and TLS; use an enforcing egress proxy in environments needing a DNS-pinning guarantee.

`config/scoring-rules.json` versions the deterministic score. Title bonuses are alternatives; ownership/configuration/platform signals add bounded points. Supporting tools alone cannot earn a strong score. With the specified weights, a description-only ownership role can reach 55/100 (related), while a clear core administrator title plus responsibilities typically reaches strong. Location/pay do not change relevance.

Source observations start with adapter+board+source-ID identity. Canonical URLs remove only known tracking parameters and retain job-ID/locale parameters. Cross-source merges require an exact canonical destination and employer; fuzzy title/company similarity only creates hints. The older internal identity and first-seen time survive, and aliases redirect prior IDs. Distinct canonical requisitions stay distinct. Full description matching, speculative similarity merging, and aggregator integration are intentionally absent.

Only complete successful exhaustive enumerations increment per-observation missing counters: two → possibly closed, three → closed. Search windows, feed windows, career-page scopes, failed requests and pagination limits never establish absence. A live observation from another source keeps the merged job active. Reopening preserves identity. Stale flags are recomputed at 48 hours in collection and in the browser even if deployment stops. Default closed retention is 90 days where policy allows Git history; timestamps are actual observations, never rewritten to imply freshness.

A drop over 50% on a board with at least 20 prior active records is quarantined before merging. Other healthy boards continue. A manually reviewed `--accept-large-change` bypasses this anomaly check only. Full outage preserves previous data and successful timestamps while publishing truthful health. Failed initial live collection cannot produce an empty replacement. Permission-blocked source contributions are removed rather than retained as if they were merely unavailable.

Four files form a snapshot: manifest, jobs, sources, aliases. Runtime schemas are strict: raw responses and personal state cannot appear in a snapshot. Manifest SHA-256 hashes cover each data file. Atomic staging validates all files in a sibling temporary directory before promotion; a failed candidate preserves the accepted directory. Browser integrity validation catches mixed-version/corrupt downloads.

The data branch holds only these four public JSON files. The source/data revision is recorded in deployment metadata. A push compares the read revision with the current remote head and aborts stale writes; bounded network retries never force-push. Current permission records are also reapplied to retained jobs during outages: withdrawn optional fields are removed immediately, and missing/expired/blocked source contributions are removed conservatively. Source policy must explicitly allow public indefinite Git history. The policy gate rejects finite retention because removing today's file cannot delete historical commits.

Browser local state is versioned and validated; aliases and newest-update merge preserve tracking across refreshes and imports. Saved entries retain title, company, URL, stage and notes after public retention removes a job. No tokens, notes, statuses, saved IDs, or personal backups enter the URL or build. CSV contains only currently displayed public fields, safely quoted and formula-neutralized.
