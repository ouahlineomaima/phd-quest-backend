# Research progress API

All routes use `/api` and the existing validation/error envelope. Roadmap, goals and achievements award no XP.

- `GET /roadmap`, `GET /roadmap/:levelNumber`: twelve chapters across three years.
- `PATCH /roadmap/:levelNumber`: `{ "description": "..." }` (1?3000 characters). Initial guidance is provisional and editable.
- `PATCH /roadmap/:levelNumber/checkpoints/:checkpointId`: `{ "completed": true|false, "evidence"?: "..." }` (evidence up to 2000 characters). Only the current chapter accepts validation or correction. First validation history is retained.
- `POST /roadmap/:levelNumber/complete`: `{ "confirm": true }`. Requires every mandatory checkpoint. Completion and unlocking the next chapter are one transaction. Repeats are idempotent; chapter 12 creates no further chapter. Completed checkpoints cannot be reversed. Metadata edits preserve progress.
- Initialization inserts all twelve chapters atomically only into an empty map. Existing descriptions and progress are preserved; a partial map requires explicit repair.

- `GET /goals?type=weekly|monthly|research&status=active|completed|archived`: filters are optional.
- `POST /goals`, `PATCH /goals/:id`: title (nonblank, max 160), description (max 2000), type; optional targetDate, relatedWeekId, relatedRoadmapLevel. Dates use real `YYYY-MM-DD` calendar dates. Week references require an existing Sunday-start plan; chapter references require an existing level. Optional links/due date may be cleared with null.
- `PATCH /goals/:id/complete`, `/reopen`, `/archive`: empty JSON body. Completion/reopening is idempotent and preserves first-completion history. Archive is terminal: retained for filtering, with no editing or reopening. Goals can be independent of other records and never complete tasks/checkpoints.

- `GET /achievements`: reconciles eight definitions against authoritative persisted evidence in a transaction. Dashboard reads also reconcile. Unlock timestamps are written only once. Distinct historical task source IDs count toward ten tasks; longest streak, first checkpoint validation and first goal completion survive subsequent corrections or reopening. Unlock dates indicate when reconciliation recognized the milestone.
- `GET /dashboard`: one snapshot of gamification, current Sunday?Saturday week in APP_TIMEZONE, today's tasks, scheduled/recorded workload, current research chapter, five recent active goals plus total, ten recent completion events, and achievement totals/recent unlocks. Missing current plan returns planId/progress null. Weekly baseline is 360 minutes. Uses existing XP, streak and weekly-progress calculations.

Focused checks: after `npm run build`, `node --test test/research/dashboard.test.cjs`; Mongo-backed checks `node test/research/{roadmap,goals,achievements}.check.cjs` each create/drop only their own random validation database using MONGODB_URI. `api.check.cjs` requires a separately started, disposable API and explicit RESEARCH_TEST_BASE_URL / RESEARCH_TEST_DB_URI; it leaves fixtures for browser checks. Never point that API at user data. No reset/reseed endpoint is provided.
