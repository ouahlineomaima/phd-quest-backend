# Stage 3 maintainability

Scoped rollout: quality-scope.json lists the adopted files. Untouched files remain a documented baseline; no global formatting or rule suppression is applied. New files in these refactoring surfaces must be added to this manifest.

Use npm run lint and npm run format:check for checks; they never modify files. npm run format deliberately formats only the adopted scope. Prettier uses two-space indentation, single quotes, trailing commas and LF endings; Angular templates use the Angular parser. TypeScript ESLint checks typed code, unused imports/variables, explicit any and unnecessary assertions. Angular templates also receive supported accessibility rules.

## Diagnostics

Every HTTP request receives an X-Request-ID response header (also exposed through CORS). Only canonical lowercase UUID v4 client IDs are accepted; other values are replaced. Completion logs use framework route templates, method, status and elapsed milliseconds. Unmatched routes use a fixed marker. Internal failures add one diagnostic record with a bounded error category, existing application/library source locations, and at most two cause levels. Messages, function names, raw URLs, headers and bodies are excluded. Public error bodies and ordinary validation/conflict/origin behavior remain unchanged.

## Validation

`node --test test/stage3/diagnostics.test.cjs test/unit/logging.test.cjs` checks logging and HTTP correlation without MongoDB writes. `test/stage3/browser.check.cjs` uses the existing isolation helper: an empty UUID database, ownership marker, private API and cleanup are required. Set PLAYWRIGHT_CORE_PATH and the host Mongo URI explicitly; never point browser mutations at the running application API. Existing Stage 1/2 suites remain the regression baseline.

No persisted schema or migration changes were introduced. Existing application package versions are unchanged; added dependencies provide development quality checks and Express declarations.

## Verified result

The backend production build and scoped lint/format checks pass. The consolidated supported Node 24 regression run passed 102 tests, including Stage 1/2 concurrency, read purity, legacy identity handling, backup rollback and old/new backup compatibility, Focus manual time application, XP and streak history. The host Node 22 run exposed two timezone-data differences; the unchanged checks pass under the supported Node 24 image.

The built frontend passed 14 Stage 3 browser checks and 14 existing Stage 1/2 browser checks using installed Edge through Playwright. Chrome did not launch in this environment. All browser writes used verified empty UUID databases and private APIs; cleanup is in finally. Automated semantics and keyboard checks were performed; no actual screen reader was available.

All 12 production research collection hashes/counts match the pre-work baseline. The existing MongoDB volume retains its original 2026-11-14 creation timestamp. Startup hooks can change the operational control revision; it is audited separately from research records and from read-only API calls. No application dependency versions changed, and Stage 4/Feature 4 were not started.

Use npm run test:stage3 for focused diagnostics/compatibility tests with an explicit Mongo URI (the compatibility test replaces its database name with a verified UUID namespace). npm run test:stage3:browser also requires PLAYWRIGHT_CORE_PATH and optionally CHROME_PATH; the latter can point to Edge. Run builds sequentially with watch servers stopped on memory-limited Docker installations.

Final live verification: 16 API/proxy GETs succeeded and kept revision 199 unchanged. Two application startups advanced only the operational control revision by 2. All 12 research fingerprints still matched; no disposable test databases remained. Both application containers were restored healthy.
