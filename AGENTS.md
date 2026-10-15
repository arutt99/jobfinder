# JobScout

Use Node 24 and npm ci. Read Atlassian_JobScout_Codex_Build_Plan.md for product requirements.

Checks: npm run lint, npm run typecheck, npm test, npm run test:integration, npm run demo, npm run build, npm run test:e2e.

The browser loads same-origin validated public snapshots only. Keep scoring and schemas in shared/. Provider responses stay in collector memory; public projection happens before durable storage. All personal tracking stays in browser localStorage and private user exports. No browser secrets or automated applications.

Synthetic data requires --fixtures, visible demo labels, and --allow-fixtures to stage. Production workflow never uses either switch. Live sources require complete approval records. Do not enable unreviewed sources or invent live listings. Failed/partial enumeration must preserve history. State goes to the data branch with ordinary fast-forward pushes, never force pushes.

Implement and verify locally in this checkout. GitHub Pages is the requested hosting target. Do not deploy to another hosting service. Never claim deployment or live-source verification without actual evidence.
