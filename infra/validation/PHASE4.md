# Phase 4 - weekly plans and JSON import

Date: 2026-11-15. The first real business feature is insert-only weekly-plan import and browsing. No Phase 5 task completion or gamification logic was implemented.

## Architecture and data safety

The weekly-plans module follows the approved api/controllers+dtos, business/services, persistence/models+enums+interfaces+repositories structure. DTOs reject unknown fields, progress injection and implicit numeric/boolean coercion. The business layer validates Gregorian calendar dates with integer arithmetic, Sunday start, six-day end offset, matching weekId, task-date membership, normalized duplicate task IDs and import byte size. Preview only reads existence and computes presentation totals. Confirm revalidates and rechecks conflicts; the database's unique weekId index catches races.

The weekly_plans collection stores embedded tasks with stable IDs. New progress is backend-initialized to pending, zero actual minutes, and null completedAt. Imports never replace or merge existing plans. Index creation is awaited during module initialization even when global autoIndex is off. There are no update/delete/completion endpoints. Full response mapping excludes Mongoose internals; lists project summaries without returning task arrays.

The canonical [contract](../../docs/contracts/weekly-plan.v1.schema.json), [import example](../../docs/contracts/weekly-plan.v1.example.json), [preview response](../../docs/contracts/weekly-plan.v1.preview.example.json), [saved response](../../docs/contracts/weekly-plan.v1.saved.example.json) and [guide/ChatGPT prompt](../../docs/WEEKLY_PLANS.md) document the wire format and limits. Dates remain strings. Timestamps are instants. Stable future reward sources can use the pair weekId/task ID; no XP transactions exist yet.

## Checks executed

| Check | Result |
| --- | --- |
| Backend production builds | Passed |
| Eight focused safety tests | Passed, 0 failed |
| Frontend production builds | Passed; final initial JS/CSS 259.69 kB |
| Final Compose startup and health | All three services healthy |
| Frontend / direct API / proxied health / plan list | HTTP 200; database up |
| Valid API preview | 200, normalized plan, 7 days, correct totals |
| Preview database side effects | No record created |
| Invalid JSON / unsupported version / missing fields | Rejected |
| Invalid dates / duplicate task IDs / invalid duration or XP | Rejected with field paths |
| Imported progress / unknown fields / numeric-string coercion | Rejected |
| Import byte-size cap | Focused rejection test passed |
| Valid confirmation | 201 with pending/0/null task progress |
| Concurrent confirmations | Exactly one 201 and one 409; one record |
| Existing-week preview | canImport=false and explicit conflict |
| Existing-week confirmation | 409 WEEK_EXISTS; no replacement |
| Existing progress preservation | Completed status, actual minutes and timestamp retained on own test fixture |
| Unique weekId index | Present and unique in MongoDB |
| List/detail | Newest-first summaries, no tasks in list, full detail round-trip |
| Unknown/malformed detail IDs | 404 / 400 |
| MongoDB persistence | Direct DB readback and frontend reload confirmed saved records |
| Browser import and daily browsing | Passed, including empty day and blocked duplicates |
| Concurrent change after browser preview | 409 becomes blocked preview, list refreshes on close |
| Dialog keyboard/focus and pending guard | Passed |
| Backend unavailable UI | Friendly retry state verified using an intercepted 503 |
| Responsive saved view / dialog | 375px overflow checks passed after grid fix |
| Browser errors | No unexpected JavaScript/runtime/console errors |
| Final temporary-record cleanup check | Zero phase-created API/browser smoke records remained |

The repeatable `test/plans/api.smoke.cjs` checks real HTTP and MongoDB using a free UUID-marked 2099 week. It modifies completion fields only on its own temporary fixture to prove duplicate protection, then removes that record. The browser smoke uses separate UUID-marked 2099 records and removes only those records. No user's real research week was used, and the canonical 2026 example was not seeded into MongoDB.

The original replica set, Compass mapping, external database volume, Compose configuration, dependency versions and /api proxy were preserved. No volume-removal command was used. Because infrastructure/database configuration did not change, the full infrastructure persistence verification was not rerun. Default test commands retain all existing tests and add the focused plan tests; the full unrelated suites were not run for this phase.

An attempted isolated final build mounted dist as a volume; Nest's output cleanup hit Docker's EBUSY restriction on removing a mount root. The normal production build and all eight focused checks were rerun successfully, followed by a backend-only restart and successful Compose health checks. No application or database configuration change was needed for this tooling issue. Final volume inspection retained phd-quest_mongo_data's original 2026-11-14T22:45:53Z creation time.

## Local implementation commits

Backend: 31d5ceb contract; f2a82b7 store; 8eb43b1 preview validation; a778132 save/list/detail; aee83b6 focused safety checks.

Frontend: 479d8b9 saved-plan browsing; fd049c0 import preview/confirmation; 67d1892 late-conflict UI and list refresh.

Documentation commits follow these implementation commits; see git log and the final report for hashes. Pushes were skipped without retrying unavailable GitHub credentials.

## Limitations and next phase

Imports are insert-only, single-user, JSON v1 only. There is no editing, replacement, merge, deletion, authentication, pagination or backup/export flow. File size and per-field limits are documented; potential XP is metadata, not earned XP. Other frontend business pages remain previews. A failed/lost confirmation response may still mean the server saved the week; revalidation safely discovers the conflict rather than overwriting it.

Phase 5 should design completion idempotency, unique XP source keys, transaction boundaries and daily-activity timezone rules before adding completion endpoints or rewards. No such implementation has begun.
