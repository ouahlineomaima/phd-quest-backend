# Research Focus Timer

Saved focus sessions use client-generated UUIDs, immutable timing fields and idempotent saves. Countdown sessions are capped at their target (1-180 minutes); stopwatch focus is capped at seven days. Pauses are excluded. The client uses timestamps and never detects whether a person was working while the browser was closed.

Sessions keep whole seconds. Statistics attribute all session time to the session end date in APP_TIMEZONE (default Africa/Casablanca); today/week/overall minutes floor the summed seconds. The current week is Sunday-Saturday. Applying one session floors its own seconds/60, so sessions under one minute cannot be applied.

Manual task actualMinutes is tied to completion, capped at 1440, and can be deliberately edited on recompletion. Focus time therefore uses a separate additive task total derived from sessions with appliedAt. Applying is user-confirmed, transactional, and idempotent; it changes only the session application marker. It never overwrites manual minutes, completes a task, awards XP or changes streak/goal/checkpoint states. These two time measurements may describe the same work; the UI shows them separately and does not claim they are automatically disjoint.

API: POST /api/focus-sessions; GET /api/focus-sessions?page=1&limit=20; GET /api/focus-sessions/summary; GET /api/focus-sessions/task-times?weekId=YYYY-MM-DD; GET /api/focus-sessions/:sessionId/application-preview; POST /api/focus-sessions/:sessionId/apply-time with {"confirm":true}.

Save validates task existence and stores a title snapshot. Idempotent retries still work if that task later disappears. History remains readable; applying to a missing task is rejected. Old version-1 backups may omit focusSessions/count; restore clears focus history in that case. New backups preserve seconds, historical references, application markers and applied totals without replaying applications. Unapplied historical references may be unavailable; applied records must reference an existing restored task. No timer snapshot, break history or browser preferences are exported. Roadmap and weekly import contracts are unchanged.
