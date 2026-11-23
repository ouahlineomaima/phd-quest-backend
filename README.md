# PhD Quest backend

A local research workspace for planning a PhD and recording progress. NestJS 11, Mongoose 8 and MongoDB 8 run on Node.js 24 (`^24.15.0`; `.nvmrc` selects the 24.x line). The sibling [Angular frontend](https://github.com/ouahlineomaima/phd-quest-frontend) uses the same supported runtime. There is no authentication, multi-user support or AI API integration.

## Features and boundaries

- Sunday-start weekly plans, stable task identities, completion/reopening and exactly-once XP.
- Daily activity, streak history, achievements and read-only dashboard summaries.
- Goals connected to tasks across weeks, and goals connected to roadmap checkpoints.
- Independent Level 0 Preparation Camp and twelve research chapters; manual checkpoint validation and level completion.
- Shared manual-control task/Focus timer, timestamp-based recovery, corrected durations and explicit exactly-once task-time application.
- Supervisor profiles, meeting notes, preparation/follow-up actions and linked research activity.
- Research Skill Tree, prerequisites, manual proficiency/history, evidence and targeted readiness.
- Version-1 workspace backup export, validation preview and atomic restore; JSON plan/roadmap imports.

Task identities are `weekId:taskId`. Derived progress never substitutes for manual goal completion, checkpoint validation, proficiency confirmation or meeting-action status. Focus application, skills and meeting actions do not automatically complete weekly tasks or award XP.

## Start with Docker

Keep `phd-quest-backend` and `phd-quest-frontend` as siblings. From their parent workspace, with Docker Desktop's Linux engine running:

```powershell
docker volume create phd-quest_mongo_data
docker compose -f phd-quest-backend/infra/docker-compose.yml up -d --build --wait
```

Creating an already-existing volume leaves it intact. MongoDB runs as the single-node replica set `rs0`; transactions require a replica set. The existing **external** volume `phd-quest_mongo_data` stores research records. Never delete/recreate it, and never use a volume-deleting shutdown for recovery or testing.

Frontend: http://localhost:4200. API: http://localhost:3000/api. Health: http://localhost:3000/api/health. The canonical Compose file and additional port/Compass guidance are in [infra](infra/README.md).

Ordinary shutdown preserves the external database volume:

```powershell
docker compose -f phd-quest-backend/infra/docker-compose.yml down
```

## Host development

Use Node 24.15+ within 24.x; `nvm install`/`nvm use` can read `.nvmrc` where your version manager supports them. Verification refuses unsupported Node versions rather than hiding timezone-data differences.

```powershell
npm ci
Copy-Item .env.example .env
npm run start:dev
```

Review `.env` before startup; it is ignored by Git. MongoDB must already be available as a writable replica-set primary. The example host URI uses `directConnection=true` because the Compose replica set advertises its internal `mongodb` hostname.

| Variable                                       | Purpose/default                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `PORT`, `NODE_ENV`                             | API port 3000; development/test/production                                             |
| `MONGODB_URI`                                  | Required application database connection; host example is in `.env.example`            |
| `APP_TIMEZONE`                                 | Calendar attribution, default `Africa/Casablanca`                                      |
| `CORS_ORIGINS`                                 | Exact trusted frontend origins, default `http://localhost:4200`                        |
| `BODY_LIMIT_BYTES`                             | Ordinary JSON request limit, default 1 MiB; backup route has its own bounded allowance |
| `MONGO_CONNECT_TIMEOUT_MS`                     | Connection timeout, default 5000                                                       |
| `MONGO_RETRY_ATTEMPTS`, `MONGO_RETRY_DELAY_MS` | Bounded startup retries; defaults 3 and 1000                                           |

Do not publish the local unauthenticated database/API beyond the intended machine. No credentials are required by the supplied local Compose setup; never commit connection secrets.

## Architecture and API

```text
src/modules/<feature>/
  api/controllers/             HTTP endpoints and headers
  api/dtos/                    input validation and response contracts
  business/services/           domain rules and transaction coordination
  persistence/repositories/    private Mongoose models, projections and queries
  persistence/models/          persisted schemas
  persistence/interfaces/      stored and resolved domain types
  persistence/enums/           canonical serialized values
src/database/                  connection, shared write guard and edit versions
src/common/                    validation, calendar, origin boundary and safe diagnostics
```

HTTP routes use `/api`. Main groups are `/health`, `/weekly-plans`, `/gamification`, `/goals`, `/roadmap`, `/achievements`, `/dashboard`, `/focus-sessions`, `/supervisors`, `/supervisor-meetings`, `/research-skills` and `/backup`. Focus history is paginated; list contracts for skills/meetings remain compatible. Summary/detail reads use targeted projections or aggregation where useful; see [performance measurements and audit closure](docs/STAGE4.md).

Existing Skill/category, Supervisor/Meeting, action and evidence mutations require the version originally loaded: `If-Match: "<editVersion>"` (actions expose the parent's `meetingVersion`). Missing versions return 428, malformed versions 400 and stale versions 409 `STALE_RECORD`. Clients retain their draft and require explicit discard/reload; they must never retry automatically with a new token. Restore rotates editor tokens.

Browser mutations require JSON content type and a trusted exact Origin. Originless JSON CLI requests remain supported; this boundary is not authentication. Public errors stay sanitized. `X-Request-ID` correlates safe route/category/code-location diagnostics; request bodies, research content and credentials are excluded from logs.

Dashboard, roadmap and achievement GETs are read-only. Eligibility is evaluated within guarded commands; `POST /api/achievements/evaluate` with `{}` explicitly reconciles older eligible awards. Startup initialization hooks may advance the operational write revision separately from ordinary reads.

## Backup and historical links

Version-1 backups retain the six original sections and accept newer optional `focusSessions`, `supervisors`, `supervisorMeetings`, `skillCategories`, `researchSkills` and `skillTreeState` sections. Omitted optional sections initialize empty. Restore verifies types, references, timezone, digest and workspace revision, requires `REPLACE ALL DATA`, and atomically replaces data with rollback on failure. Export the current workspace before a restore you intend to perform. Test restores must use owned disposable databases.

Checkpoint associations use immutable `checkpointIdentity` UUIDs as well as public level/checkpoint keys. Roadmap replacement creates new identities. Replaced links remain unavailable; identity-less legacy links remain explicitly unverified until the user removes/saves/relinks them. No migration guesses historical identity, and no GET assigns identity or changes progress.

## Verification

```powershell
npm test                 # Build once, then safe tests; no MongoDB required
npm run verify           # Build, scoped lint, full maintained-file format check, safe tests
npm run lint
npm run format:check
npm run format           # Deliberate formatting, not a check
```

Database-writing checks require a separate opt-in and `TEST_MONGODB_URI`; the ordinary application `MONGODB_URI` is ignored by the verification runner. [The verification guide](docs/VERIFICATION.md) documents integration, performance, browser and full-regression commands, supported browsers, Docker usage, troubleshooting and fail-closed ownership checks. [Stage 4](docs/STAGE4.md) records measurements and the AUD-001?016 closure table.

The GitHub Actions workflow uses Node 24 to run `npm ci` and `npm run verify`, without a database or production secrets. Integration/performance/browser suites are intentionally excluded from this lightweight workflow. Scripts return nonzero on failed checks; `--no-build` is only for a known fresh build.

## Feature references

[Weekly plans](docs/WEEKLY_PLANS.md), [task progress/XP](docs/TASK_PROGRESS.md), [connected research](docs/RESEARCH_PROGRESS.md), [roadmap import](docs/ROADMAP_IMPORT.md), [Focus](docs/FOCUS.md), [meetings](docs/SUPERVISOR-MEETINGS.md), [skills](docs/RESEARCH-SKILLS.md), [backup](docs/BACKUP.md), [concurrency/security](docs/STAGE1-SAFETY.md), [typed domains and identity policy](docs/STAGE2-ARCHITECTURE.md), [facades, diagnostics and accessibility](docs/STAGE3.md). Historical phase documents describe their executed scope; current commands are maintained in the verification guide.
