# Stage 4: performance, verification and audit closure

Stage 4 addresses AUD-008, AUD-011 and AUD-016. The starting trees were clean at backend `ba45521` and frontend `c5d15ae`; these include the separately authorized full formatting pass after the approved Stage 3 commits. No research schema, backup version, application dependency major version, XP reward or feature was added. Custom Challenges & Rewards was not started.

## AUD-008: measured read paths

The benchmark uses one deterministic synthetic fixture on owned empty UUID databases: 156 weekly plans / 3120 tasks, 120 goals, the fixed roadmap, 200 skills across active/archived categories with 6000 evidence records and 4000 history entries, 500 meetings / 2500 actions, and 8000 Focus sessions across many dates. The pre-optimization baseline was measured before edits on Node 24.22.3 and MongoDB 8; subsequent comparisons use the same fixture, frozen application clock and UTC calendar. The same complete canonical response hashes and payload sizes must match. Production records were never benchmark fixtures.

The table records before / after. Read commands count find/aggregate commands (not transaction commands or cursor getMore). Materialized records include cursor batches received by Node. Materialized bytes are their JSON encoding size, not wire/BSON or heap size. Latency is the median of three warm runs after one warm-up; it is observational and not a portable SLA or pass threshold. These are service-call timings, not HTTP timings. Background watch/application load varied during verification; materialization counts and exact response equivalence are the primary evidence.

| Path           | Read commands before / after | Materialized records before / after | Materialized JSON bytes before / after | Response bytes before / after | Median ms before / after |
| -------------- | ---------------------------- | ----------------------------------- | -------------------------------------- | ----------------------------- | ------------------------ |
| skillDetail    | 6 / 6                        | 3458 / 7                            | 8215200 / 40686                        | 41490 / 41490                 | 353.6 / 48.39            |
| skillSummary   | 6 / 2                        | 3458 / 1                            | 8215200 / 646                          | 638 / 638                     | 194.91 / 54.99           |
| meetingActions | 5 / 2                        | 1324 / 396                          | 2234371 / 174264                       | 248705 / 248705               | 278.1 / 66.88            |
| meetingSummary | 1 / 1                        | 437 / 1                             | 2115790 / 236                          | 290 / 290                     | 58.03 / 21.77            |
| focusSummary   | 1 / 2                        | 8000 / 1                            | 905359 / 66                            | 165 / 165                     | 798.4 / 18.92            |

Skill detail now fetches one skill, its category and projected prerequisites, then batches only referenced cross-week tasks, goals and identity-qualified checkpoints. Full list responses retain their contract. Skill summary aggregates active counts and the last upward history entry per active skill in MongoDB; evidence and full histories no longer cross into Node. Recent-improvement ordering retains date, custom order and ID tie behavior.

Meeting lists already applied parent/archive/supervisor filters in MongoDB; their full response fields remain compatible. Action selection now matches and projects only relevant embedded actions before task resolution, bypassing unrelated notes, supervisors, goals and checkpoint resolution. Summary counts and the next meeting use one aggregate result. Inspection also found a correctness defect: an action `status` had been applied as a parent-meeting status. The selectors are now separate; open/completed action results follow the requested manual action status, with explicit regression comparisons against the complete action list. This is the intentional behavior correction; response fields and manual status rules are unchanged.

Focus uses database aggregation for global seconds/count/countdowns plus an indexed, narrowly projected recent window. Node's `localDateAt` performs exact today/week attribution on the recent rows, with a two-day padding on both calendar boundaries; MongoDB timezone conversion is deliberately avoided because its IANA data can differ. A separate owned-database regression compares active-window totals at midnight, Sunday and DST boundaries in UTC, Casablanca, New York and Apia. The historical benchmark's current week is empty, so its recent-window query materializes zero rows; active-week materialization depends on recent activity volume.

Explain statistics record each initial cursor; foreign lookup stage work is not summed into a total. Skill detail examines 2 selected week documents rather than scanning all 156, action selection examines 334 parent documents rather than 437, and Focus global totals still examine all 8000 sessions.

No indexes were added, changed or dropped. Existing ID indexes, unique week identity, Focus history's endedAt prefix and meeting action/archive indexes support the targeted paths. Explain evidence shows Skill detail's old collection scans becoming indexed lookups, and embedded-action selection reducing examined parent records. Skill summary and global Focus aggregation still scan relevant server-side records; eliminating those scans would require additional maintained state or a separately justified index. No speculative cache or redundant index/write/storage cost was introduced. The dashboard's existing bounded current-week, fixed-roadmap and limited-goal dependencies were inspected and retained.

`test/stage4/performance-baseline.json` retains the actual baseline metrics/hashes. Normal `test:performance` compares them and writes ignored after-run artifacts. The benchmark is a synthetic read fixture, not a full backup fixture; valid feature lifecycles/backups are checked separately by integration suites.

## AUD-011: reproducible verification

Both repositories have `.nvmrc`, the existing compatible package engines, a small Node 24 runtime guard, `verification.json`, a verification runner, safe test scripts and lightweight CI. Defaults require no MongoDB. Database groups require explicit TEST_MONGODB_URI and private application instances. Legacy initialization now reserves an empty, verified UUID database before any startup writes, and cleanup checks ownership. The shared fixed foundation test database and caller-managed live-API assumptions were removed. The infrastructure PowerShell probe is read-only and no longer writes markers or restarts services.

Playwright Core is a pinned backend development dependency. Installed Edge/Chrome/Chromium discovery, explicit executable overrides, bounded launch attempts and actionable failures replace required external package paths and one machine's Chrome path. No browser binary is downloaded automatically. One consolidated browser workflow extends existing concurrency/history coverage with all feature routes, backup controls, layouts, keyboard/reference recovery and time boundaries. Existing focused browser workflows remain available.

The CI workflow runs safe Node 24 build/lint/format/unit checks without databases or production secrets. Isolated integration, performance and browser groups are intentionally excluded from CI and remain explicit local gates. Local command success is distinct from observing a remote CI run.

## AUD-016: current documentation

Both primary READMEs now describe the actual feature inventory, routes, architecture, runtime, Docker/proxy behavior and developer commands. [Verification](VERIFICATION.md) separates safe checks, explicitly opted-in writes, browser integration and read-only diagnostics, with troubleshooting and CI exclusions. Relevant historical command paragraphs point to the current guide. Backward-compatible version-1 optional sections, atomic digest/revision-protected restore, fresh editor versions, manual states, historical checkpoint identities and pure GET behavior are documented.

## Final validation record

Executed on Node 24.22.3: backend production build, scoped lint and maintained-file formatting; 58 safe backend Node tests; 52 isolated Node integration tests; all 12 distinct standalone integration/smoke scripts; five performance response-hash/materialization comparisons with action-status and calendar regressions; frontend production build/quality and all 16 tests; one consolidated Edge browser workflow with 18 checks. Persistence-restart cases were rerun after making restart ownership explicit, while fresh-target refusal remains strict. Relevant Stage 1/2/3 guards, old/new backups, rollback, XP/streaks, Focus, archived/missing references and manual state tests passed.

During Stage 4 the user intentionally completed two real tasks after opening the configured localhost origin. The initial activity fingerprints therefore changed legitimately in weekly plans, XP, daily activity and achievements; no test used those records. All twelve research fingerprints matched before those user actions, and all ten original XP transactions still match their original hash; the two later task-completion awards are retained. The final comparison matched all twelve research collections against a separate post-user checkpoint, and no owned test databases remained. Sixteen ordinary GET requests through the API and frontend proxy left operational revision unchanged at 211. The read-only infrastructure probe passed; the existing external volume was retained. Operational control/startup changes are separate from research fingerprints; no initial-to-final startup revision delta is claimed. Actual screen-reader testing is unavailable; browser automation covers semantics and keyboard interaction only. Remote CI execution is not claimed from local verification.

## AUD-001 through AUD-016 closure

| Finding                               | Stage                             | Implementation / final caveat                                                                                   |
| ------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| AUD-001 stale editors                 | 1                                 | Atomic If-Match writes; drafts retained; restore rotates tokens                                                 |
| AUD-002 unsafe smoke testing          | 1, reinforced 4                   | Explicit disposable ownership, private APIs and failure cleanup                                                 |
| AUD-003 browser-origin writes         | 1                                 | Exact trusted origins and JSON-only mutation boundary; not authentication                                       |
| AUD-004 mutating GETs                 | 2                                 | Snapshot reads; command-driven awards; explicit reconciliation; startup revision tracked separately             |
| AUD-005 repository bypass             | 2                                 | Private models and typed persistence methods                                                                    |
| AUD-006 weak contracts/types          | 2                                 | Named contracts, typed domains and raw backup validation                                                        |
| AUD-007 checkpoint identity collision | 2                                 | Approved immutable identities; legacy references remain unverified until explicit relink                        |
| AUD-008 broad materialization         | 4                                 | Measured targeted projections/aggregates; server scans/list payload contracts retained where required           |
| AUD-009 oversized UI/coupled loads    | 3                                 | Page facades, details/editors and independently recoverable references                                          |
| AUD-010 duplicated domains            | 2                                 | Canonical enums and shared validation primitives; wire values retained                                          |
| AUD-011 fragmented verification       | 4                                 | Safe default, owned integration, Node 24, portable browser tooling and CI; remote CI execution not yet observed |
| AUD-012 formatting/lint               | 3 plus authorized formatting pass | Maintained files formatted; typed lint adoption remains explicitly scoped                                       |
| AUD-013 non-reactive meeting time     | 3                                 | Boundary-aware signal clock with cleanup and timezone-preserving comparisons                                    |
| AUD-014 missing diagnostics           | 3                                 | Correlated safe route/category/stack-location logging; research content omitted                                 |
| AUD-015 Skill keyboard feedback       | 3                                 | Native button selection, labelled details and focus restoration; manual screen-reader testing outstanding       |
| AUD-016 stale READMEs                 | 4                                 | Current READMEs, verification guide, compatibility/safety notes and linked feature docs                         |
