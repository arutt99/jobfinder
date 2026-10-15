# Release validation

Validated October 15, 2026, in the managed Linux x64 workspace with Node v24.19.0 and Chromium. Mobile tests use Playwright's iPhone 13 viewport/touch emulation in Chromium, not Safari.

| Check                                                       | Actual local result                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Fresh `npm ci` from lockfile                                | Passed                                                                                                                        |
| `npm run lint`                                              | Passed                                                                                                                        |
| `npm run typecheck`                                         | Passed                                                                                                                        |
| `npm test`                                                  | 55 passed                                                                                                                     |
| `npm run test:integration`                                  | 16 passed                                                                                                                     |
| Root fixture build and browser suite                        | 18 passed                                                                                                                     |
| `/jobfinder/` fixture build and browser suite               | 18 passed                                                                                                                     |
| Empty live configuration build and production browser smoke | 2 passed; no provider requests and no false successful-collection timestamp                                                   |
| Automated WCAG 2 A/AA and 2.1 AA scan                       | No violations on dashboard, role details, or settings at desktop and mobile sizes                                             |
| Snapshot/artifact safety                                    | Passed for explicit local demo and production-mode empty setup; demo remains rejected by default production stage/state paths |
| `npm audit`                                                 | 0 vulnerabilities across production and development dependencies                                                              |
| 5,000-record filter benchmark                               | 24.8 ms, 2,144 results; under the 200 ms target                                                                               |

The benchmark used Node v24.19.0 on Linux x64, AMD EPYC 9V74 80-Core Processor. It measures synchronous filtering/sorting only, excluding network, browser rendering and data loading. It is an observed local result, not a guarantee on other devices.

Behavior coverage includes title/description scoring and contextual JSM aliases; incidental Jira usage; Unicode/HTML normalization; source permissions; bounded HTTP/retries/challenges/body limits; Lever pagination/interruption; Ashby unlisted jobs and unknown compensation; RSS/Atom and JSON-LD; identity/deduplication/aliases; durable first-seen/lifecycle/reopening; outages and anomaly quarantine; current permission projection of retained jobs; atomic writes and integrity; isolated temporary Git state with stale-write rejection; OR/AND filters, explicit geography and pay units; corrupt/full storage; imports, recovery and safe exports; keyboard focus return; browser-local save/notes/stage persistence; manual entries; and root/subpath data loading.

Desktop/mobile screenshots are generated at `work/desktop-dashboard.png` and `work/mobile-dashboard.png`. Local browser diagnostics and generated state remain ignored. The final local snapshot is the clearly labeled 14-job synthetic demo; `npm run dev` starts it.

## External release status

- **Verified live employer sources:** 0. The production registry is empty; optional aggregators remain disabled/unimplemented.
- **Hosted GitHub Actions execution:** not performed. Local checks exercise the implemented pipeline; they are not a claim of a hosted CI result.
- **Pages deployment / verified public URL:** not performed. No repository Pages setting was changed and no live data branch or Pages deployment was published during local validation. Source code is delivered separately through the implementation branch and pull request.
- **Remaining setup:** merge the reviewed implementation into the default branch, enable Pages with GitHub Actions, onboard actual permitted sources, and manually bootstrap the refresh workflow. See README and source/operations runbooks.

Known coverage and architecture limits are documented in `docs/decisions.md` and `docs/source-policy.md`. Automated accessibility checks complement the tested keyboard flow; they do not certify every assistive technology or browser.
