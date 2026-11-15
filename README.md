# PhD Quest backend

The modular monolith uses NestJS 11.2.10, TypeScript 5.9.3, Mongoose 8.24.9 and Node 24 in Docker. Phase 4 adds insert-only weekly-plan imports and browsing in the weekly_plans collection; no seed data, task completion or gamification is implemented. Dependency versions are unchanged. See the [weekly-plan contract, API examples and ChatGPT prompt](docs/WEEKLY_PLANS.md) and [Phase 4 validation](infra/validation/PHASE4.md).

## Run locally

Keep this repository beside `phd-quest-frontend`. The canonical shared configuration is [infra/docker-compose.yml](infra/docker-compose.yml); setup and Compass details are in [infra/README.md](infra/README.md).

```powershell
cd infra
docker compose up -d --build
docker compose down
```

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

For example, a future task controller would validate a request DTO and call a task service. The service would enforce business rules and call a task-specific repository. That repository alone would access the task model. This example is documentation only; no task module exists yet.

To add a feature: create these directories; define explicit request/response DTOs; register schemas with `MongooseModule.forFeature` inside the feature; provide the feature service and repository; register its controllers; import the feature module in AppModule; add unit and HTTP tests. Keep business services independent of request objects. Avoid generic repositories, CQRS and extra transaction abstractions.

## Environment configuration

`ConfigModule` validates configuration at startup before connecting. Errors list invalid setting names and acceptable ranges, without printing values or credentials. The existing MongoDB driver parses the URI without opening a connection. Numeric settings accept integers only; CORS accepts explicit comma-separated HTTP origins, without paths or credentials.

| Setting | Default | Validation |
| --- | --- | --- |
| MONGODB_URI | Required | Valid mongodb or mongodb+srv URI |
| NODE_ENV | development | development, test, production |
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

The existing rs0 connection supports native `session.withTransaction` or Mongoose `connection.transaction`; no additional framework is needed. Future task completion, XP and daily activity writes can share one session, backed by feature-specific uniqueness constraints and idempotency rules. Those models and rules are intentionally deferred. The integration test proves commit and rollback across two temporary collections in `_foundation_validation`, then drops only those uniquely named test collections.

## Tests

No test framework was previously installed. Tests use Node's built-in runner, existing NestFactory and existing validation libraries; no new dependencies are needed.

```powershell
npm test                  # Build + deterministic unit and HTTP tests; no MongoDB
npm run test:integration  # Build + live rs0 transaction test; requires MONGODB_URI
npm run test:plans        # Build + focused weekly-plan safety tests
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
