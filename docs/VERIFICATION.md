# Developer verification

Use Node 24.15+ in the 24.x line. `.nvmrc`, package engines, the Docker images and CI share that policy. Node 22 can ship different timezone data; the runner rejects it before verification. Each repository has `verification.json` as the discoverable suite inventory and `scripts/verify.mjs` as its small orchestration entry point.

## Local build/lint/unit checks: no database

From the frontend, `npm ci && npm run verify` builds Angular, checks scoped lint and all maintained-file formatting, and runs Focus engine, domain-contract, facade/reference recovery, stale-feedback and meeting-clock tests. `npm test` runs only its tests. `npm run test:stage3` selects the focused facade/clock group.

From the backend, `npm ci && npm run verify` builds Nest once and runs lint, formatting and the safe unit/HTTP suite. `npm test` builds once and runs the safe tests without requiring MongoDB. The runner overrides application database configuration with an unreachable non-production URI for safe tests. HTTP tests use test-owned ephemeral servers and test doubles, not the running API.

Targeted groups are `npm run verify -- build`, `... -- lint`, `... -- format` (check only) and `... -- unit`. Backend `test:plans`/`test:progress` select safe rules/DTO tests. `--no-build` skips compilation only when you already have a fresh output. No test group rebuilds between its files.

`npm run format` deliberately writes maintained source/templates/styles/tests/config/docs; dependencies, generated outputs, lockfiles and agent instructions are excluded. Lint is staged adoption listed in `quality-scope.json`, extended for Stage 4 query/tooling files; it is not a claim that untouched legacy code has been fully linted.

## Disposable database-writing integration

Use a dedicated writable test replica set where available. The application's MongoDB server can also host UUID test databases, but never select its real database as the test seed. From the backend, explicitly configure the test-only seed:

```powershell
$env:TEST_MONGODB_URI = 'mongodb://localhost:27017/phd_quest_test?replicaSet=rs0&directConnection=true'
npm run test:integration
npm run test:performance
```

`phd_quest_test` is only a connection seed; suites generate distinct UUID database names before connecting. The runner rejects a production database name, missing opt-in, `dbName` redirection and external API URL overrides. It ignores application `MONGODB_URI`. All writing suites verify the connected database name and emptiness before first initialization, reserve a random ownership marker, use private application instances, and require that marker and original URI before cleanup. Parallel test files own independent databases. Cleanup never removes a foreign or unproven database.

Integration covers foundation transactions, weekly plans/XP/streaks, Focus save/apply/history, meetings/actions/profiles, skills/proficiency/evidence/prerequisites, goals/roadmap/replacement, achievements, HTTP security/concurrency, legacy identities, old/new backups, preview staleness and injected rollback. Legacy API checks now create private APIs; `API_BASE_URL`, `PROGRESS_TEST_BASE_URL` and `RESEARCH_TEST_BASE_URL` are refused.

Focused database groups include `test:focus`, `test:backup`, `test:roadmap`, `test:goals`, `test:achievements`, `test:research`, `test:meetings`, `test:skills`, `test:safety`, `test:stage2`, `test:stage3`, `test:plans:smoke` and `test:progress:transactions`. These require the same explicit test URI. The manifest lists additional standalone checks included in `test:integration`. Direct legacy scripts remain available with Node 24 and explicit connection settings, but the runner is the supported entry point.

Performance verification inserts synthetic, deterministic multi-year fixtures only into an owned empty database. It compares complete response hashes with the reviewed pre-optimization baseline, checks status/calendar invariants, and records read-command counts, returned records/JSON bytes, payload bytes, plans and warm-run latency. It never benchmarks real research records. Baseline capture is an explicit pre-change developer operation, not part of normal verification; never replace baseline evidence with an optimized run presented as the old implementation.

## Browser integration

Install both repositories' dependencies and build the frontend first. Backend `playwright-core` is a pinned development dependency; no external installation path is required and no browser binary downloads automatically. The launcher discovers installed Edge, Chrome or Chromium on Windows/macOS/Linux, or uses an already-present managed Chromium binary. Explicit `BROWSER_EXECUTABLE` takes priority; `CHROME_PATH` and `PLAYWRIGHT_CORE_PATH` remain optional compatibility overrides.

```powershell
# Frontend repository
npm run build
# Backend repository; set TEST_MONGODB_URI as above
$env:BROWSER_EXECUTABLE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' # optional
npm run test:browser
```

Use an installed executable appropriate to your platform; the shown override is only a Windows example. Missing/unlaunchable browsers fail with actionable diagnostics. Host browser checks also require supported Node 24. A browser installed on Windows cannot be executed by a Linux container; run the browser group on the host, or provide an installed Linux browser inside the test container.

The consolidated browser run reuses one private API/proxy/database and checks stale two-tab drafts, origin rejection, checkpoint generations, manual proficiency, read purity, navigation across all feature routes, backup controls, dark/light desktop/mobile layouts, keyboard selection, optional-reference failure and meeting time transitions. `test:stage3:browser`, `test:meetings:browser` and `test:skills:browser` retain focused historical workflows. Frontend `npm run test:browser` delegates to this backend-owned isolated workflow. Browser artifacts remain ignored. Automated semantics/keyboard checks are not actual screen-reader validation; manual assistive-technology testing remains outstanding.

## Consolidated full regression

With dependencies installed, a supported runtime, test replica set and browser available:

```powershell
# Frontend: build and safe checks once
npm run verify
# Backend, after setting TEST_MONGODB_URI:
npm run verify -- all
```

The backend full sequence is build, lint, format check, safe tests, isolated integration, performance comparison and one consolidated browser workflow. It requires the sibling frontend build. Individual groups can be rerun with `--no-build` after fixing only a test harness/documentation issue; rebuild after application TypeScript changes. Output identifies each group and propagates failures. Tests within compatible Node groups use concurrency 2; application builds and groups are sequential to avoid competing watch/build processes on memory-limited Docker installations.

## Docker and read-only diagnostics

For safe checks without a host Node installation, from the workspace root:

```powershell
docker compose -f phd-quest-backend/infra/docker-compose.yml run --rm --no-deps backend sh -c 'npm ci --no-audit --no-fund && npm run verify'
```

That temporary container uses the Node 24 image. For an isolated integration group, add `-e TEST_MONGODB_URI=mongodb://mongodb:27017/phd_quest_test?replicaSet=rs0` before the service name and use `npm run test:integration`. Start MongoDB first, preserve its external volume, and stop application watch servers when necessary to avoid overlapping compilers. Run frontend verification separately with the frontend service. A host browser group needs its own local `npm ci`; do not assume Docker's anonymous Linux dependency volume is the host dependency tree.

Read-only diagnostics: GET `/api/health`, the frontend's proxied health endpoint, and `infra/scripts/verify.ps1` inspect running services/replica readiness/volume configuration without inserts or restarts. `test/meetings/fingerprint.cjs` prints only record counts/hashes when explicitly given an application URI; it never mutates records. Startup initialization may advance the operational revision; compare that separately from read purity and the twelve research collection fingerprints.

## CI and troubleshooting

Each repository's `.github/workflows/verify.yml` runs Node 24, `npm ci`, build, scoped lint, formatting and safe tests, using read-only repository permissions and no production secrets. Integration/performance/browser suites are intentionally excluded because this workflow provisions no ephemeral MongoDB/browser. The local consolidated command remains the full regression gate. Workflow syntax follows the official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) documentation; remote CI success must be observed separately from local command success.

- Unsupported Node: select `.nvmrc`'s 24.x runtime and ensure it satisfies package engines; do not mask timezone assertions.
- Missing build artifacts: run the appropriate production build; `--no-build` does not create output.
- Isolation refused: use `TEST_MONGODB_URI` naming `phd_quest_test`, remove external API overrides, and verify replica-set readiness. Never weaken guards or empty an existing database to make a test pass.
- Browser unavailable: install a supported browser or set a valid executable override; installing Playwright Core alone does not install Chromium.
- Docker out of memory: stop backend/frontend watch containers and verify sequentially; do not remove MongoDB or its volume.
- Failed cleanup proof: retain the database for investigation; never manually drop a target until its exact UUID identity and ownership have been independently established.

Explicit persistence-restart checks first close the prior application, then re-verify the existing reservation and ownership marker. Fresh application setup still refuses every nonempty target, including an already-running owned database.

A 403 UNTRUSTED_ORIGIN means the address-bar origin differs from CORS_ORIGINS. The default application address is http://localhost:4200; http://127.0.0.1:4200 is a distinct origin. Use the configured address, or explicitly add an intended alternative to the trusted list and recreate/restart the backend configuration. Do not disable the origin boundary.
