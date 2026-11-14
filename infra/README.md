# Shared development infrastructure

Canonical Compose configuration lives here in the backend repository. Keep the frontend and backend as sibling clones:

```text
phd-quest/                        not a Git repository
  README.md, VALIDATION.md        local pointers
  docs/                          existing local requirements PDF
  phd-quest-frontend/             origin: ouahlineomaima/phd-quest-frontend
    .git/, AGENTS.md, README.md
    Dockerfile, .dockerignore, .gitignore
    angular.json, package*.json, tsconfig*.json, proxy.conf.json
    src/app/                     empty standalone shell, core/shared/features
  phd-quest-backend/              origin: ouahlineomaima/phd-quest-backend
    .git/, AGENTS.md, README.md
    Dockerfile, .dockerignore, .gitignore, .env.example
    nest-cli.json, package*.json, tsconfig.json
    src/config/, src/database/, src/common/, src/modules/health/
    infra/
      docker-compose.yml         only canonical Compose file
      .env.example               Compose settings; .env stays untracked
      README.md
      scripts/verify.ps1
      scripts/compass-check.cjs
      validation/PHASE1.md
      validation/PHASE1.5.md
      validation/PHASE2.md
```

## Start and stop

Use Docker Desktop's Linux engine and Compose v2. From the parent workspace:

```powershell
cd phd-quest-backend/infra
# Optional overrides: Copy-Item .env.example .env
# If Docker Desktop's Linux context is not already selected:
# docker context use desktop-linux
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose down
```

Compose resolves build contexts and bind mounts relative to this directory. Its project name remains `phd-quest`; existing containers, network and database volume retain their identity. Compose automatically loads `infra/.env` when invoked here. Backend `.env` is only for running NestJS directly on the host; Compose supplies backend settings explicitly.

The existing volume `phd-quest_mongo_data` is declared external to prevent accidental Compose lifecycle deletion or silent creation of a different volume after this migration. It already exists on this workstation. On a brand-new workstation only, create the initial empty volume explicitly with `docker volume create phd-quest_mongo_data` before startup. Never delete or recreate the existing volume. Normal `docker compose down` preserves data. Never use volume removal during routine operation.

Frontend: http://localhost:4200 (intentionally blank). API health: http://localhost:3000/api/health. Proxy: http://localhost:4200/api/health. Host application ports and MongoDB bind only to 127.0.0.1.

## MongoDB Compass on Windows

Use this connection URI in Compass:

```text
mongodb://127.0.0.1:27017/phd_quest?replicaSet=rs0&directConnection=true
```

`directConnection=true` is required for this host-side setup: rs0 advertises `mongodb:27017`, a Docker-only hostname. Direct connection keeps Compass on the published localhost address. The backend continues using `mongodb://mongodb:27017/phd_quest?replicaSet=rs0` internally, with no topology change.

MongoDB 8 remains a single-node rs0 with automatic initialization only when uninitialized, followed by a writable-primary health check. Backend startup waits for that readiness check. No credentials are needed for this local development database; do not publish it beyond localhost.

Before startup, check `Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue`. If an unrelated process occupies it, set `MONGO_HOST_PORT=27018` (or another free port) in `infra/.env` and change the Compass URI accordingly. The internal port remains 27017. For the host probe below also set `$env:MONGO_HOST_PORT` to the same override.

## Builds and verification

Both applications build independently using Node 24.15+ (24.x): run `npm ci` and `npm run build` in the respective repository. No dependency versions changed through Phase 2. Backend architecture, configuration and test commands are documented in ../README.md.

From this directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1
# Optional protocol-level Compass check, with host Node and backend npm dependencies installed:
node scripts/compass-check.cjs
```

The verification script starts the services, checks frontend/API/proxy, checks rs0 readiness, inserts a unique document into `_foundation_validation`, performs an ordinary Compose restart, confirms the document remains, deletes that test document, and checks localhost TCP and health again. It leaves the services running. The host probe separately connects from Windows using Mongoose with the exact Compass URI and validates a ping and writable rs0 primary. This checks protocol connectivity without requiring the Compass GUI.

Source bind mounts and polling enable hot reload. Dependencies use anonymous container volumes so Windows node_modules never replace Linux dependencies. After changing a lockfile, use `docker compose up -d --build --renew-anon-volumes` to refresh only anonymous dependencies; the external database volume is unaffected.

## Git workflow

Both repositories use main. After each validated semantic unit: review changes, run relevant checks, stage related changes only, make a local Conventional Commit, and report its hash. Push only when GitHub authentication is already working; pushes are optional. Do not force-push, amend pushed commits or rewrite remote history. Keep secrets, .env files, database data, backups, dependencies, build outputs and temporary files untracked. If authentication is unavailable, retain local commits and continue without repeated authentication attempts or requests for credentials. Repository AGENTS.md files preserve these instructions for subsequent phases.

See validation/PHASE1.md and validation/PHASE1.5.md for historical results, and validation/PHASE2.md for backend foundation validation. Phase 3 has not been started.
