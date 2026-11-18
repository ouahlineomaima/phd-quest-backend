# Stage 2 architecture and domain contracts

Implemented AUD-004, AUD-005, AUD-006, AUD-007 and AUD-010; Stage 1 guards remain active.

## Read-only GETs and achievements

Dashboard and achievement GETs use snapshot read transactions, without applicationWrite or reconciliation. Repeated reads do not change persisted data or preview revisions. The same achievement evaluator runs inside weekly-plan confirmation, task transitions, goal transitions, checkpoint validation and roadmap completion transactions. Unique award rows and first-unlock guards preserve exactly-once unlock dates; achievements still award no XP.

POST /api/achievements/evaluate with JSON `{}` provides explicit guarded reconciliation for eligible legacy records. The Achievements page exposes **Check eligible achievements**. Ordinary refresh/navigation remains read-only. Existing conditions use historical facts and longest streak, rather than a time-sensitive current streak, so midnight alone requires no mutation or scheduler. Command/evaluation no-ops retain the established global revision policy.

## Persistence and API ownership

Skill and Meeting repositories keep injected Mongoose models private. Concrete typed methods own ordered reads, projections, initialization markers, inserts and conditional versioned updates. Services own rules and coordinate sessions through the existing applicationWrite guard; reads use snapshots. Checkpoint identity capture is a shared roadmap persistence operation invoked only inside an explicit linking transaction.

Stored records, mutation DTOs, resolved responses and unavailable references have distinct types. Skill level/target domains are restricted; proficiency history has one required `changedAt` field. Editor versions remain opaque strings used in quoted If-Match headers. Affected response methods have named contracts and Angular uses typed endpoint methods.

Backup traversal first checks raw primitive/nested-array types against the existing persistence schemas without casting/coercion, then applies all existing strict shapes, limits and historical/cross-record checks. UTC instant/history and DTO validation primitives are shared. The affected services, repositories and backup validators no longer use explicit any/as any.

## Canonical enums

Backend feature-owned enums and the independent frontend domain enum module preserve the serialized values in `docs/contracts/domain-values.v1.json`: SkillLevel (numeric 0-4), SkillSourceType, EvidenceType, SupervisorRole, MeetingType, MeetingStatus, MeetingActionPhase, MeetingActionStatus, GoalStatus, GoalType, TaskStatus, FocusMode, FocusCompletion and RoadmapStatus. TaskStatus was already a real backend enum. UI icons/colors remain typed readonly tuples; display labels stay separate.

Independent checked contract fixtures and frontend interface/enum tests detect drift; backend HTTP lifecycle checks validate representative real serialized responses. No shared package or dependency upgrade was introduced.

## Checkpoint identity and old backups

The user explicitly approved the conservative policy in [the identity design](AUD-007-IDENTITY-PROPOSAL.md). Ordinary edits preserve checkpointIdentity; confirmed roadmap replacement assigns new server UUIDs even when public composite IDs repeat. UUIDs never enter roadmap-import JSON or preview digests. New links capture the current identity under the shared write guard. Editors submit an identity they already know and preserve it during edits; old source-ID-only integrations explicitly resolve a new link to the current checkpoint at command time.

Qualified historical links resolve only when composite key and UUID match. Replaced references remain visible as unavailable, never silently retargeted. Identity-less historical links remain **unverified**, with missing completion evidence and blocked targeted readiness until explicitly unlinked/relinked. No bulk migration or GET-time identity assignment runs. Existing manual proficiency, action status and checkpoint validation/unlocking remain independent.

Version-1 backups accept optional checkpoint identities and preserve them on round trip; all older optional sections remain supported. Legacy backups without identities remain accepted with the approved unverified policy. Restore still rotates operational editor tokens independently from domain checkpoint identities and preserves atomic replacement, digest/revision checks and rollback.

## Verification commands

After building, run `npm run test:stage2` with MONGODB_URI configured for a test replica set. HTTP tests create their own API and verify an empty UUID database before any writes; cleanup checks ownership. `npm run test:stage2:browser` reuses the consolidated Stage 1 browser workflow and adds generation/relinking, proficiency, history and read-purity checks. Supply PLAYWRIGHT_CORE_PATH and optionally CHROME_PATH; artifacts stay in the ignored frontend .artifacts directory. Frontend `node --test test/domain-contract.test.cjs test/focus-engine.test.cjs` needs only existing dependencies.

Stage 3/4 work, broad formatting, component decomposition, accessibility/clock changes and new features are excluded.

The final concurrent-import smoke check also exposed a Mongoose rollback interaction with strict embedded task schemas. Embedded tasks now explicitly disable their unused Mongoose version key (stable task IDs and all strict validation remain intact). The smoke script always cleans its verified database even if an assertion fails before it receives a saved record ID; a fault-injection regression checks API shutdown and cleanup.

## Executed verification (2026-11-18)

Backend and Angular production builds passed. Consolidated and focused reruns cover 94 unique passing backend Node test entries, eight frontend test entries and 14 distinct real-browser checks. Disposable plan smoke, Focus, XP/streak, backup/rollback, achievement, goal and roadmap scripts also passed. The final embedded-task rollback correction was checked with concurrent imports, an injected smoke failure, plan validation, XP transactions and complete backup/rollback. Stage 1 origin and stale-editor regressions passed, including two real browser tabs retaining drafts. Legacy full feature browser suites were not rerun separately; the consolidated workflow covers affected editors, linking, replacement, history, legacy restoration, manual proficiency, read purity, origins and desktop/mobile layouts.

Raw legacy backup input now has explicit optional-section types, while exports have complete section types; digest behavior and stored records are unchanged. No dependencies were added or upgraded.

Final live verification through the actual Angular proxy: health was OK, six Dashboard/Achievement GETs left the application revision unchanged, and all 12 production research collection counts/hashes matched the pre-change baseline. The operational revision advanced only during existing startup hooks while the development backend restarted; it was not reset. The external MongoDB volume retained creation identity 2026-11-14T22:45:53Z. No Stage 1/2/smoke disposable database namespaces remained after cleanup.
