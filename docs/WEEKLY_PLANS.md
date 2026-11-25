# Weekly plans v1

The authoritative import contract is [weekly-plan.v1.schema.json](contracts/weekly-plan.v1.schema.json), with a [complete valid example](contracts/weekly-plan.v1.example.json). Backend DTOs and frontend TypeScript interfaces implement this same wire format; the independent repositories do not import each other's source code.

`schemaVersion` is the number 1. `weekId` is the Sunday calendar date, not an ISO week number. It must equal `startDate`; `endDate` must be the Saturday six calendar days later. Dates are real Gregorian YYYY-MM-DD dates in 1900-9999, stored as strings. Calendar comparisons use day ordinals, not timezone conversion. Each task date must be inside its week. Task IDs are stable lowercase slugs (1-64 characters, letters/digits/underscore/hyphen), unique within the week. Reuse IDs unchanged when generating the same tasks again; a future reward source can use weekId + task ID.

Human-readable text and task IDs are trimmed before validation; dates must use the exact calendar-date format. Title: 1-160 characters. Objectives: 1-20 strings, each 1-300 characters. Tasks: 0-200. Description: optional, at most 2,000 characters. Notes: optional, at most 5,000. Deliverable: required, 1-500. Optional means absent, not null. estimatedMinutes: integer 1-1440 per task. xpReward: integer 0-1000, potential reward metadata only. priority: low/medium/high. isOptional: a JSON boolean. Unknown fields, including imported status, actualMinutes, completedAt, database IDs, and previewValidated flags, are rejected. No coercion of numeric strings or booleans is allowed.

The JSON Schema describes field-level constraints; the server also enforces cross-field dates, trimmed nonblank strings and duplicate task IDs. Files are limited to 500 KiB; the server limits normalized import JSON to 500 KiB in addition to the existing HTTP body-size limit (default 1 MiB). The 6-hour weekly baseline is a reference, never a limit. Workload and potential XP totals are simple sums of import metadata; no XP is awarded.

## API

Both POST endpoints take the import object directly, with Content-Type application/json. They do not take a wrapper or proof-of-preview token.

- POST `/api/weekly-plans/import/preview`: HTTP 200 with `{ plan, totals, days, canImport, conflicts }`. plan is normalized v1 input; totals contains taskCount, estimatedMinutes, potentialXp; days contains seven `{date, taskCount, estimatedMinutes, potentialXp}` summaries. Existing weeks produce a WEEK_EXISTS conflict warning and canImport=false. No data is written.
- POST `/api/weekly-plans/import/confirm`: HTTP 201 with the saved full plan. Revalidates everything and rechecks conflicts. Existing weeks, including races detected by the database unique index, return HTTP 409 with code WEEK_EXISTS. There is no replace or merge mode.
- GET `/api/weekly-plans`: HTTP 200 array of lightweight summaries, newest start date first: `{id, weekId, startDate, endDate, title, taskCount, estimatedMinutes, potentialXp, createdAt, updatedAt}`. Embedded tasks are not returned.
- GET `/api/weekly-plans/:id`: full saved plan or HTTP 404 for an unknown ObjectId; malformed IDs return HTTP 400.

Full responses include id (MongoDB ObjectId as string), all v1 fields, createdAt/updatedAt ISO timestamps, and embedded tasks with backend-managed status=pending, actualMinutes=0, completedAt=null. Calendar dates remain date strings; timestamps represent instants. Mongoose internals and __v are not returned. Errors use the global `{statusCode, code, message, details, timestamp, path}` envelope. Semantic validation details contain `{field, message}`; structural validation details contain `{field, rules}`. Example: tasks.1.date identifies the second task date. Duplicate conflicts identify weekId. Confirmation is always authoritative even after a successful preview.

The pending/zero/null values above are initialization values for new imports. Detail responses preserve any server-managed progress already present. Complete wire examples are [preview response](contracts/weekly-plan.v1.preview.example.json) and [saved/detail response](contracts/weekly-plan.v1.saved.example.json); their IDs and timestamps are illustrative, not seeded records.

From this repository, send the canonical request with:

```powershell
curl.exe -X POST http://localhost:3000/api/weekly-plans/import/preview -H "Content-Type: application/json" --data-binary @docs/contracts/weekly-plan.v1.example.json
```

Preview is safe to repeat. Submit the same JSON to import/confirm only when you intend to save that week. Do not submit the saved-response example as an import: database IDs, timestamps and progress fields are deliberately forbidden in imports.

Focused checks: `npm run test:plans` covers deterministic rules/DTOs. `npm run test:plans:smoke` now requires explicit `TEST_MONGODB_URI` and creates a private API with an empty UUID database and ownership-checked cleanup; it never targets a running API. See [current verification](VERIFICATION.md).

## Conflict and progress policy

Saved tasks support PATCH `/api/weekly-plans/:planId/tasks/:taskId/description` with `{ "description": "Optional notes" }`. It returns the updated saved plan. Text is trimmed, limited to 2,000 characters, and an empty string removes the description. Weekly Plan offers Add/Edit description, Save and Cancel for pending and completed tasks. This transaction updates only the description; completion, actual time, XP and activity history are preserved. Descriptions remain compatible with version-1 imports and full-workspace backups.

The weekly_plans collection has a unique weekId index ensured before serving requests. Tasks are embedded with no separate task collection. Duplicate IDs are rejected before saving. Initial progress is assigned by the backend, never imported. Import is insert-only: repeated imports cannot reset existing task status, actual duration or completion timestamps. Editing, merging and replacing a week require a later explicitly designed workflow.

## Reusable ChatGPT prompt

Generate a PhD Quest weekly plan. Return valid JSON only, with no Markdown code fences or commentary. Use exactly schemaVersion, weekId, startDate, endDate, title, objectives, tasks and optional notes. Set schemaVersion to number 1. I will supply a Sunday start date and research intentions. weekId and startDate must equal that Sunday as YYYY-MM-DD; endDate must be the Saturday six calendar days later. Do not use ISO week numbers. Use real calendar dates, objectives as 1-20 nonblank strings (max 300 chars), and 0-200 tasks. Each task must contain exactly id, date, title, estimatedMinutes, xpReward, priority, isOptional, deliverable and optional description. Task IDs must be stable lowercase slugs matching [a-z0-9][a-z0-9_-]{0,63}, unique in the week; preserve supplied IDs on repeated generation. Task dates must be inside the week. Titles max 160 chars; description max 2000; deliverable required, nonblank, max 500; notes max 5000. estimatedMinutes must be an integer 1-1440; xpReward an integer 0-1000; priority low/medium/high; isOptional a boolean. Include expected deliverables and reasonable estimated minutes and potential XP for every task. Never fabricate status, completion timestamps, actual duration, awarded XP, database IDs or validation flags. Keep output under 500 KiB. Treat 6 hours per week as a planning reference, not a hard limit. Ask for the Sunday start date and research intentions before generating if I have not provided them.

Phase 5 completion and gamification are outside this contract's import scope. No authentication, editing, pagination, replacement or merging is included in Phase 4.
