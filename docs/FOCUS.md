# Research Focus and integrated task timer

Start a stopwatch from a Weekly Plan task, or choose a task/standalone countdown or stopwatch on Focus. Both use the same server-persisted Focus session and shared Angular service. A running or paused timer appears in the shell on every page. Starting another task opens the existing session; it never transfers time or replaces that session.

## Lifecycle and confirmed time

The existing `focus_sessions` collection now accepts optional lifecycle fields. Historical records are unchanged. New records move through `running`, `paused` and `stopped`; stopped sessions cannot resume. A partial unique `activeSlot` index enforces one running/paused timer per workspace, including across browsers. Commands use the existing application-wide transactional guard. Lifecycle changes rotate `editVersion` and require quoted `If-Match`; restore generates fresh tokens. Repeated pause/stop and application requests are safe.

Accumulated time is stored in integer milliseconds; saved measured history remains whole seconds, floored once from the accumulated milliseconds. Running display interpolation uses server timing and the browser's monotonic clock; interval callbacks do not award time. Pause excludes its entire interval. Countdown targets remain 1–180 whole minutes; stopwatch duration remains capped at seven days. A confirmed target heartbeat finalizes a countdown automatically. Breaks use the same slot/timing infrastructure but are excluded from Focus history, summaries and task application.

The elected tab sends a heartbeat every 15 seconds. Each accepted heartbeat records server time, confirmed milliseconds and a 45-second lease. A generation token, owner ID and strictly increasing sequence reject old-owner, replayed and out-of-order requests. A late request cannot resurrect an expired session. On expiry, authoritative duration is exactly the last confirmed duration, with no grace minute and no time through the next browser launch. Pure GETs derive a paused/recovered view without persisting anything; reconcile/resume/stop are guarded commands. No background worker is needed.

Start/Resume explicitly confirms a five-minute work window. Trusted pointer/keyboard interaction in any app tab renews that confirmation through the leader's next heartbeat. Scheduled requests alone cannot renew it. This is an explicit activity policy, not proof of research performed outside the application: interact with PhD Quest at least every five minutes or resume after automatic pause. Hiding a tab or losing window focus does not itself pause the session. Rest breaks instead allow their full five/fifteen-minute target without work interaction; their connection lease and close/recovery policy still apply, and they never contribute research time.

## Tabs and browser lifecycle

Web Locks elect one heartbeat sender; BroadcastChannel distributes change notifications, and small current-session reads reconcile other tabs. Local-storage presence entries are advisory and expire after 12 seconds; backend ownership, versions, lease and unique slot remain authoritative. Stale presence can suppress a best-effort close request but cannot extend authoritative elapsed time indefinitely.

`pagehide` attempts a same-origin JSON `fetch` with `keepalive` and `If-Match` when no other recently present tab remains. Angular route navigation does not trigger this handler. Another active tab can claim ownership without being paused when the owner closes. Reloading the last tab can also deliver this pause. Browser termination, sleep, connectivity loss, frozen tabs and simultaneous close races may prevent delivery; recovery then excludes all time beyond the last committed heartbeat. Lifecycle delivery is never guaranteed. Opening the application fetches the same existing session and offers Resume or Stop; recovery never creates a replacement.

Legacy browser-local recovery snapshots are retained for explicit inspection/save or discard. Only their previously persisted accumulated duration is offered; old unconfirmed unattended elapsed time is not added. Saved legacy sessions keep their original UUID and timing fields. Refresh existing tabs after upgrading both applications so obsolete browser-local code is replaced by the shared server timer.

## Review, correction and exactly-once application

Stop automatically saves measured history and opens review on Focus. Saving without applying leaves task time unchanged and can preserve a corrected effective duration. Whole effective minutes from 0 to 1440 are accepted; the default is `floor(measuredSeconds / 60)`. Each short session follows that same policy independently; there is no hidden carry or retroactive rewrite. Corrections preserve original measured seconds, and statistics continue to summarize measured time by end date in `APP_TIMEZONE` (Sunday–Saturday weeks).

New timer applications atomically add the accepted effective minutes to the linked task's existing `actualMinutes`, capped at 1440. The session stores effective seconds, application timestamp/minutes, mode `task-actual`, and before/after task totals. A preview-based expected task total detects intervening manual edits; conflicts retain the input for explicit latest-record inspection. Application is transactional and idempotent, including retries and concurrent clicks. No task completion, XP, streak, goal, checkpoint or proficiency changes occur. A later manual recompletion edit can deliberately change actual minutes and never resets application status. Multiple sessions can contribute once each. Missing tasks preserve history and cannot be substituted by title.

Compatibility-sensitive change: historical applications remain separate Focus totals and are never added retroactively to task actual time. The legacy save endpoint and legacy `{confirm:true}` application retain their original semantics for old clients. Reviewing/correcting an unapplied legacy session in the new UI explicitly opts into the new actual-time application. The UI identifies legacy applications separately, avoiding double-counting them as new task actual time.

## API

- `POST /api/focus-sessions/start`: UUID `sessionId`, UUID `ownerId`, `kind`, `mode`, nullable `targetSeconds` and nullable stable `weekId:taskId` reference.
- `GET /api/focus-sessions/current`: authoritative current session or null; expired status is derived, read-only.
- `POST /api/focus-sessions/:id/pause|resume|stop|claim|reconcile`: lifecycle commands with `If-Match`; resume/claim require `ownerId`.
- `POST /api/focus-sessions/:id/heartbeat`: owner ID/token, next sequence and activity confirmation boolean.
- `POST /api/focus-sessions/:id/correction`: `{effectiveMinutes}` and `If-Match`; only unapplied stopped Focus sessions.
- Existing history, summary, task-times and application-preview GETs remain available.
- Existing `POST /api/focus-sessions/:id/apply-time` additionally accepts `effectiveMinutes` and `expectedActualMinutes`; new applications require `If-Match`.
- Existing `POST /api/focus-sessions` remains the idempotent legacy save endpoint.

The exact-origin, JSON-only mutation boundary, originless CLI policy, correlation IDs and sanitized errors are retained. Heartbeats are application writes and can invalidate a pending full-workspace restore preview; pause the timer before previewing a restore.

## Backup and verification

Version-1 backups still accept the omitted optional Focus section and old saved records. New exports preserve measured/corrected duration and application provenance, without replaying applications. One active slot is permitted in a backup. Restore keeps its confirmed duration, forces it paused, clears owner/lease credentials and rotates editor tokens. Digest/revision checks and atomic replacement/rollback remain in place. Existing applied sessions cannot become eligible for reapplication.

Use Node 24 and the [verification guide](VERIFICATION.md). `npm run test:focus` runs both legacy Focus checks and the integrated lifecycle/application/backup tests on owned UUID databases. `npm run test:browser` includes the existing Stage 1–4 workflow plus integrated task timer navigation, correction, tabs, close delivery/fallback, layouts and keyboard checks. Default safe tests include pure timing rules; the frontend default suite includes shared timer state tests. Production research records are never test fixtures. Browser automation does not constitute actual screen-reader testing.
