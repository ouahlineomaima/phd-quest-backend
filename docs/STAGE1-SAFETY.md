# Stage 1 correctness and browser write safety

Scope: AUD-002, AUD-001 and AUD-003 only.

## Safe smoke test

`test/plans/api.smoke.cjs` requires `--isolated` plus an explicit `SMOKE_MONGODB_URI` with a fresh UUID database name. It refuses external `API_BASE_URL` targets, real/nonconforming databases and nonempty databases. The test starts its own ephemeral API with that exact connection; before writes it verifies the selected database, verifies emptiness and creates an ownership marker. Cleanup checks that marker and the selected database again. Supported completion APIs maintain XP/activity invariants. See the README for invocation.

## Record concurrency contract

Skill categories, research skills, supervisor profiles and meetings expose an opaque string `editVersion` in responses. Embedded meeting action responses also expose the parent's `meetingVersion`. Updates to existing records require `If-Match: "<editVersion>"`, including archive/status commands, evidence creation/edit/deletion and meeting action creation/edit/deletion. Create/template-initialization endpoints have no record precondition. DTO bodies stay unchanged.

Missing preconditions return 428 `VERSION_REQUIRED`; malformed/wildcard/list preconditions return 400 `INVALID_VERSION`. Stale versions return 409 `STALE_RECORD` with `details.recordId` and `details.currentVersion`. Clients must preserve their draft and obtain explicit user intent before discarding it; never retry automatically with a newer token.

Version checks and conditional writes occur inside the existing applicationWrite transaction. Each conditional update matches both ID and the persisted token and assigns a new UUID. The shared write guard remains in place and retries transaction conflicts against fresh state. Updates to unrelated records do not invalidate record tokens. Every accepted replacement rotates its token, even if submitted fields are unchanged. Existing proficiency-level no-ops and already-archived archive no-ops validate the precondition, then retain the token and histories. These accepted no-ops still participate in the existing global revision policy.

Legacy records without a persisted token expose `legacy:<recordId>` and acquire a UUID on first edit; no migration writes existing research data. Archived aggregates stay read-only. All proficiency, XP and manual completion rules remain unchanged.

Tokens are operational metadata: version-1 backup exports omit them. Restore validates the unchanged historical contract and generates fresh UUIDs for all restored editable aggregates, within the existing atomic restore transaction. Old backups remain supported; domain data and histories round-trip exactly. Rotating on restore prevents an older backup from reviving a stale client's token. A failed restore rolls back tokens and data together.

## Browser write boundary

`CORS_ORIGINS` is also the exact trusted-origin list for writes (default `http://localhost:4200`). Existing configuration validation permits only canonical HTTP(S) origins, without paths, credentials or wildcards. Add explicitly trusted environment-specific frontend origins to that comma-separated list; neither Host nor forwarded headers grant write access.

Before body parsing or business logic, all methods except GET/HEAD/OPTIONS require `Content-Type: application/json` (charset parameters are allowed). Even empty mutation commands must send JSON content type, normally with `{}`. URL-encoded, multipart and text forms are rejected with 415. A supplied Origin must match the configured list exactly; null, malformed and unexpected values receive 403 `UNTRUSTED_ORIGIN`. Originless requests with cross-site Fetch Metadata are also rejected. Normal originless JSON CLI/local automation remains supported. This is browser-origin protection, not client authentication. CORS response behavior for reads/preflight is preserved.

Confirmed before the change, on an isolated API/database: an untrusted-origin URL-encoded supervisor POST returned 201 and persisted a record while omitting Access-Control-Allow-Origin. Browser delivery depends on browser/network policy; the browser check separately exercises a real cross-origin form against only the isolated API after the fix.

## Focused verification

After a backend build, `node --test test/safety/stage1.test.cjs` covers refusal guards, isolated HTTP origin/content-type checks, simultaneous/stale record writes, legacy version handling, restore invalidation and rollback. Set MONGODB_URI to the replica-set connection; tests replace its database with a verified empty UUID namespace and never send writes to the running API.

`test/safety/browser.check.cjs` now uses the local Playwright Core development dependency and portable installed Edge/Chrome/Chromium discovery. Explicit executable overrides remain supported. It serves the built frontend through a private changeOrigin proxy and an owned database. See [current verification](VERIFICATION.md); original Stage 1 results below remain historical.

Future Stage 2 decision (not implemented here): use real numeric SkillLevel and string SkillSourceType enums while preserving proficiency 0-4 and source strings; keep UI icon/color choices as strongly typed readonly constants.

## Executed verification (2026-11-18)

Backend production build passed with a separate output directory; Angular production build passed. Consolidated backend tests plus the focused corrected meeting rerun cover 80 passing Node test entries. Six frontend timer-engine tests passed. The safe plan smoke script, focus-session checks, backup/rollback checks and XP/streak transaction script each passed. Eight distinct browser checks passed across the main run and focused boundary/layout reruns, including real two-tab conflicts, trusted proxy writes, an actual external form returning 403, Dashboard/Help and desktop/mobile layout. Legacy full feature browser suites were not rerun; their proxy fixtures were adjusted to explicitly trust their ephemeral origins and syntax-checked.

Read-only before/after fingerprints match for all 12 research collections. The operational `_application_control` revision changed during normal development-server restarts; existing roadmap/achievement startup hooks use the shared write guard even for no-op seeding. No research records were changed, and the revision was not reset. The external volume retained its original creation identity (2026-11-14T22:45:53Z). All test writes/restores used disposable databases; an interrupted browser fixture was removed only after checking its exact owner marker, ID, timestamp and synthetic records.
