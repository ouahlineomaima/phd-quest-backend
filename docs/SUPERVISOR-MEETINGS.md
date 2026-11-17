# Supervisor Meeting Tracker

`SupervisorMeetingsModule` owns `supervisors` and `supervisor_meetings`. Actions are embedded in their parent meeting with stable IDs and timestamps. All writes use the existing `applicationWrite` transaction/revision guard; batch reads resolve associations from one snapshot. No task, XP, streak, focus, goal-completion or checkpoint-validation writer is called by this feature.

## API

- `GET/POST /api/supervisors`; `PATCH /api/supervisors/:id` and `/:id/archive`.
- `GET/POST /api/supervisor-meetings`; `GET/PATCH /:id`; `PATCH /:id/status` and `/:id/archive`.
- `POST /:id/actions`; `PATCH/DELETE /:id/actions/:actionId`.
- `GET /api/supervisor-meetings/actions` and `/summary`.

Meeting filters: `status`, `supervisorId`, `archived=active|archived|all`. Action filters: `phase`, `status` (including `open`), `meetingId`, `due=all|overdue|today|undated`, exact `dueDate`, and `archived`.

Meeting creation requires a title, at least one existing active supervisor, and either an explicitly zoned ISO `scheduledAt` or `scheduledLocal` (`YYYY-MM-DDTHH:mm`) in the application timezone. Updates retain existing archived supervisors. The server converts local times and returns `scheduledLocal` and `scheduledLabel`; persistence remains UTC. Skipped or ambiguous local times are rejected; API clients can supply an explicit offset instead.

Actions require a title and `pre_meeting` or `post_meeting` phase. Their status remains manual. `linkedTaskIds` use unique Sunday `weekId:taskId` identities, including cross-week links. Derived progress rounds to the nearest integer over available tasks and reports `linked`, `total`, `completed`, and `missing`; percentage is null when no valid tasks exist. Unavailable historical links remain visible, including when all available tasks are complete. New dangling references are rejected.

Meetings use `goalIds` and `{levelNumber,checkpointId}` checkpoint references. HTTP/HTTPS document URLs are validated, with credentials and unsafe schemes rejected. Archived profiles and meetings are read-only, retained in history and backups. Meeting completion does not change actions or research progress.

## Backup compatibility

Schema version remains 1. `supervisors` and `supervisorMeetings` are optional legacy sections with matching optional counts. Older v1 and Focus-era backups restore them empty. New exports include all fields, embedded actions and links. Validation rejects malformed history, unsafe URLs, duplicate references and missing supervisors. Legitimately unavailable historical task/goal/checkpoint references are retained. Existing digest, revision, snapshot export and atomic replace-all semantics remain intact.

## Verification

Build with the repository's Node 24 toolchain before tests. `npm run test:meetings` uses `MONGODB_URI` only as a server seed; it creates two random `phd_quest_meetings_validation_*` databases, verifies connection names and restricts cleanup to those namespaces. It covers lifecycle, validation, shared cross-week links, manual status, changing progress, concurrent actions, missing references, old/new backups, invalid-file rejection, stale previews and injected restore rollback. Time tests cover configured timezone conversion and skipped/ambiguous local times.

`npm run test:meetings:browser` also needs a built sibling frontend, Chrome and `PLAYWRIGHT_CORE_PATH`. It starts a disposable API/database and temporary localhost proxy; screenshots, exported disposable fixtures and results stay in the frontend's ignored `.artifacts/meetings/`. Never point browser tests at the real application origin.

`test/meetings/fingerprint.cjs` is read-only and outputs collection counts and hashes without research content. No tests remove Docker volumes.

### Executed results — 17 November 2026

- Backend Nest production compilation and frontend Angular production build passed. The final Nest build used isolated temporary output to avoid the running development watcher's output-cleanup race.
- 42 existing automated tests passed across the suite and selective startup rerun; 11 meeting/time tests passed across the focused suite and corrected timezone-test rerun. Existing Focus and full-backup integration check scripts also passed.
- 18 Chrome browser checks passed, including desktop/mobile dark/light views, contact and meeting lifecycle, both action phases, cross-week/shared task links, independent manual completion, consolidated action creation/filtering, archiving/removal confirmations, dashboard/Help, error recovery, and export/preview/confirmed restore.
- Legacy v1 and Focus-era restoration, complete new-data round trips, invalid-file rejection, stale-preview protection, concurrent action writes and injected transactional rollback passed in disposable databases.
- The real `phd_quest` database was never a test destination. The external `phd-quest_mongo_data` volume retained its original creation time, `2026-11-14T22:45:53Z`. No resets, imports, restores or destructive test fixtures were applied there. Existing research records were retained. Read-only comparisons showed unchanged roadmap/goal/achievement/focus records; live task/XP/activity updates occurred during the session, so the actively used database is not claimed to be byte-for-byte frozen. New production meeting collections remained empty during verification.

The startup timeout uncovered during validation was resolved by validating configuration before loading feature modules. Test timing/selectors were corrected to await rendered outcomes, and November timezone expectations were corrected to the runtime's current Casablanca rules. No unresolved feature failures remain.
