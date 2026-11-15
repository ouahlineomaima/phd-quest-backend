# Backup and recovery

Start locally from the workspace root:

```powershell
docker compose -f phd-quest-backend/infra/docker-compose.yml up -d --wait
```

Open http://localhost:4200/settings. Choose **Export backup** and retain the downloaded JSON. To recover, select **Restore backup**, choose that file, review its date/version/counts, type `REPLACE ALL DATA`, then apply. Open the restored dashboard after success. Export the current workspace first if you need to retain it. Container restarts preserve the external MongoDB volume; never remove that volume as part of recovery.

The version-1 JSON contract contains `application: "phd-quest"`, `schemaVersion: 1`, `exportedAt` (ISO UTC), `settings: {timezone, weeklyBaselineMinutes: 360}`, exact record `counts`, and `data` arrays named `weeklyPlans`, `xpTransactions`, `dailyActivity`, `roadmapLevels`, `goals`, `achievements`. Root records use stable lowercase ObjectId strings in `id`; nested task/checkpoint/event identifiers are preserved. MongoDB `_id`/`__v`, operational write guards, credentials and infrastructure are excluded. No application settings collection exists; the calendar timezone is included to interpret history. Browser theme preference remains on the device. Maximum file size: 20 MiB.

Endpoints:

- `GET /api/backup/export`: consistent snapshot, JSON attachment; never returns an incomplete export as success.
- `POST /api/backup/preview`: `{backup}`. Validates every section with application schemas and cross-record history rules; returns metadata, counts, SHA-256 `digest` and destination `revision`. Does not replace data.
- `POST /api/backup/import`: `{backup, digest, revision, confirmation: "REPLACE ALL DATA"}`. Revalidates the full file and requires a writable replica set. All six sections are replaced in one majority-committed transaction. Every application writer shares a transactional guard; a changed destination revision rejects the preview with 409. Repeated submissions with the old revision also reject safely. Re-preview and explicitly confirm again when appropriate.

Restore supports replacement only. It preserves immutable reward sources, historical completion/activity, fixed research progression and supported achievement definitions/unlocks. Unknown fields/versions, missing sections, invalid timestamps/counts/references and impossible progress are rejected before deletion. The backup timezone must match the configured application timezone; restore never edits environment/configuration files. On a fresh installation, configure the same calendar timezone before recovery. There is no automatic startup restore.

A validation error leaves data unchanged. A transaction failure rolls back all replacement writes. If the connection is interrupted after submission, reload and inspect the workspace before retrying: the server may already have committed. Production checks: `npm run build`; focused Mongo verification: `node test/backup/restore.check.cjs` with MONGODB_URI set. The check creates and removes only its own random validation databases; never run a destructive recovery check against user data.
