# PhD Quest backend

The local MVP uses NestJS 11.2.10, TypeScript 5.9.3, Mongoose 8.24.9 and Node 24 in Docker. It supports weekly plans, atomic task progress, immutable XP, timezone-based streaks, pre-PhD Level 0 Preparation Camp plus the twelve-chapter research roadmap, goals, achievements, a live dashboard, and validated transactional backup/restore. Dependency versions are unchanged. See [weekly-plan import](docs/WEEKLY_PLANS.md), [task progress](docs/TASK_PROGRESS.md), [research progress](docs/RESEARCH_PROGRESS.md), and [backup/recovery instructions](docs/BACKUP.md).

## Run locally

Keep this repository beside [phd-quest-frontend](https://github.com/ouahlineomaima/phd-quest-frontend). The canonical shared configuration is [infra/docker-compose.yml](infra/docker-compose.yml); detailed infrastructure and Compass setup is in [infra/README.md](infra/README.md).

For a fresh installation, install Git and Docker Desktop with its Linux container engine running (Compose v2). Node.js is not needed for this Docker workflow. From the directory where you want the new workspace:

```powershell
mkdir phd-quest
cd phd-quest
git clone https://github.com/ouahlineomaima/phd-quest-backend.git
git clone https://github.com/ouahlineomaima/phd-quest-frontend.git
docker volume create phd-quest_mongo_data
docker compose -f phd-quest-backend/infra/docker-compose.yml up -d --build --wait
```

The external volume must exist before first startup. The volume-create command leaves an existing volume intact; never delete it to restart or recover the application. From an existing workspace root, restart with `docker compose -f phd-quest-backend/infra/docker-compose.yml up -d --wait`. Ordinary `docker compose -f phd-quest-backend/infra/docker-compose.yml down` stops services without deleting data.

Open the app at http://localhost:4200, the API at http://localhost:3000/api, or health at http://localhost:3000/api/health. The in-app [Help & Guide](http://localhost:4200/help) explains first use, connected progress, four copyable planning prompts and downloadable generic JSON examples. No AI service is called by the application.

Data persists in the external `phd-quest_mongo_data` volume using the rs0 replica set. Export/restore is available in Settings; [backup and recovery](docs/BACKUP.md) explains full replacement, validation, timezone matching and explicit confirmation. Never remove the volume as a recovery step. Keep environment files and personal backups untracked.

For direct host execution with Node 24.15+ (24.x), run from this repository:

```powershell
npm ci
Copy-Item .env.example .env
npm run start:dev
# Production compilation and execution:
npm run build
npm run start:prod
```

The example host URI uses `127.0.0.1`/localhost and `directConnection=true` because rs0 advertises the Docker-only `mongodb` hostname. Start MongoDB through Compose before running the backend on the host, and stop the Compose backend or choose a different host PORT. Compose supplies the container URI directly and reads overrides from `infra/.env`; host NestJS reads this repository's `.env`. Keep both local files untracked.

## Architecture

```text
src/
  main.ts                          bootstrap and sanitized terminal failure
  app.module.ts                    composition root
  config/environment.ts            typed, validated environment
  database/
    database.module.ts             shared Mongoose connection
    database.options.ts            connection, retry and pool settings
  common/
    configure-api.ts               HTTP setup and parser normalization
    validation.ts                  global DTO validation
    api-exception.filter.ts        consistent safe errors
    request-logging.ts             structured request completion logs
  modules/health/
    health.module.ts
    api/controllers/health.controller.ts
    api/dtos/
    business/services/health.service.ts
    persistence/{models,enums,interfaces,repositories}/
  modules/weekly-plans/             API DTOs/controllers, validation/import service,
                                   embedded model, enums/interfaces and repository
test/
  unit/                            configuration, database options, validation,
                                   errors, logging, startup and health
  http/                            in-process Nest HTTP tests, no database
  integration/                     explicit live rs0 transaction test
infra/                             shared Compose, scripts and reports
```

Infrastructure modules may use a simple responsibility-based structure. Every future business feature must use:

```text
feature-name/
  feature-name.module.ts
  api/controllers/
  api/dtos/
  business/services/
  persistence/models/
  persistence/enums/
  persistence/interfaces/
  persistence/repositories/
```

Task-progress controllers validate DTOs and delegate to the service, which coordinates plan, XP and activity repositories in one transaction.

To add a feature: create these directories; define explicit request/response DTOs; register schemas with `MongooseModule.forFeature` inside the feature; provide the feature service and repository; register its controllers; import the feature module in AppModule; add unit and HTTP tests. Keep business services independent of request objects. Avoid generic repositories, CQRS and extra transaction abstractions.

## Environment configuration

`ConfigModule` validates configuration at startup before connecting. Errors list invalid setting names and acceptable ranges, without printing values or credentials. The existing MongoDB driver parses the URI without opening a connection. Numeric settings accept integers only; CORS accepts explicit comma-separated HTTP origins, without paths or credentials.

| Setting | Default | Validation |
| --- | --- | --- |
| MONGODB_URI | Required | Valid mongodb or mongodb+srv URI |
| NODE_ENV | development | development, test, production |
| APP_TIMEZONE | Africa/Casablanca | Supported Intl timezone; do not change existing activity dates without a migration plan |
| PORT | 3000 | 1-65535 |
| CORS_ORIGINS | http://localhost:4200 | One or more explicit origins |
| BODY_LIMIT_BYTES | 1048576 | 1024-10485760 |
| MONGO_CONNECT_TIMEOUT_MS | 5000 | 100-60000 |
| MONGO_RETRY_ATTEMPTS | 3 | 0-10 |
| MONGO_RETRY_DELAY_MS | 1000 | 0-30000 |

The database module centralizes these options. Nest Mongoose counts `retryAttempts` as total startup attempts; values 0 and 1 each allow the initial attempt only. Driver connect and server-selection timeouts use the configured timeout. The pool has at most 10 connections, idle minimum 0, and a 10-second socket timeout. Command buffering and automatic collection creation are disabled. Automatic indexes are disabled in production; future index changes need an explicit migration/deployment procedure.

## HTTP conventions

- All routes use `/api`. No versioning is enabled yet. When a breaking contract is introduced, use URI versions such as `/api/v1`; keep infrastructure health version-neutral and migrate clients deliberately.
- Global validation transforms payloads into explicit DTO classes, whitelists decorated fields and rejects unknown fields/values. Use nested DTO decorators for nested validation and explicit conversion decorators where required; implicit field coercion is not enabled.
- JSON and URL-encoded bodies share the configured size limit (1 MiB by default). URL-encoded requests have at most 100 parameters. Invalid JSON returns 400; an excessive body returns 413.
- Validation details contain field paths and rule names, never submitted values or DTO targets.
- Central exception handling formats HTTP, parser and common Mongoose errors. Unknown errors and HTTP 500 messages are masked. Database cast/validation errors map to 400, duplicate keys to 409, and network/server-selection failures to 503.
- Structured request logs contain method, path without query, final status and duration. Bodies, headers and query strings are excluded.

Example error:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [{ "field": "title", "rules": ["isString"] }],
  "timestamp": "2026-11-15T00:00:00.000Z",
  "path": "/api/example"
}
```

`GET /api/health` returns `{ "status": "ok", "database": "up", "timestamp": "ISO-8601" }` only after a live database ping. The ping timeout is at most two seconds and no greater than MONGO_CONNECT_TIMEOUT_MS. Disconnected or failed database checks return HTTP 503 with code DATABASE_UNAVAILABLE and `details: [{ "status": "error", "database": "down" }]` in the standard error format. No connection URI or database exception is returned.

## Repositories and transactions

Create concrete feature repositories using injected models. Keep all database access there, pass a `ClientSession` explicitly into participating repository methods, and use the same connection/session for every write in an atomic unit. Do not swallow transaction errors, run parallel writes on one session, or perform external side effects inside a callback that may be retried.

The rs0 connection supports multi-document transactions. Task, roadmap, goal, achievement and restore writers use `database/application-write.ts` to touch a shared revision inside their transaction. This prevents concurrent inserts or references from escaping a replace-all restore snapshot. Read-only exports use snapshot transactions. See [the backup contract](docs/BACKUP.md) for validation, confirmation and stale-preview rules.

## Tests

No test framework was previously installed. Tests use Node's built-in runner, existing NestFactory and existing validation libraries; no new dependencies are needed.

```powershell
npm test                  # Build + deterministic unit and HTTP tests; no MongoDB
npm run test:integration  # Build + live rs0 transaction test; requires MONGODB_URI
npm run test:plans        # Build + focused weekly-plan safety tests
npm run test:progress     # Build + focused completion/level/streak rules
npm run test:progress:transactions # Live rs0 check; creates and drops only its own UUID database
npm run test:plans:smoke  # Explicit live API/DB check with own test-record cleanup
```

For host integration tests, export MONGODB_URI in the shell; the standalone test runner does not load `.env`. From `infra/`, use the container environment instead:

```powershell
docker compose exec -T backend npm test
docker compose exec -T backend npm run test:integration
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1
node scripts/compass-check.cjs # Host Node and backend dependencies required
```

HTTP test routes exist only in test modules, never in production AppModule. Health/database failures use test doubles, so the default suite needs no external services. No lint configuration exists; the strict TypeScript production build and tests are the configured checks.

See [Phase 2 validation](infra/validation/PHASE2.md) for executed results. Optional pushes and local Conventional Commits are documented in AGENTS.md. Stop after the requested phase.

Implementation references: [Nest configuration](https://docs.nestjs.com/techniques/configuration), [DTO validation](https://docs.nestjs.com/techniques/validation), [exception filters](https://docs.nestjs.com/exception-filters), and [MongoDB integration](https://docs.nestjs.com/techniques/mongodb).
