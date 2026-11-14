# Phase 1.5 validation - 2026-11-14

No business features or dependency versions were changed. The parent remains outside Git. The original requirements PDF is unchanged.

## Configuration and data preservation

- The only Compose file is now `infra/docker-compose.yml` in this repository. Its project name remains `phd-quest`.
- Build contexts and source mounts resolve to the same sibling frontend/backend directories as before.
- Compose environment overrides belong in untracked `infra/.env`; its safe template is `infra/.env.example`.
- `phd-quest_mongo_data` is explicitly external and retains its original creation timestamp, `2026-11-14T22:45:53Z`. It was neither removed nor recreated.
- A test document written before the migration was found afterward and deleted after successful verification.
- Actual MongoDB binding was confirmed using Docker inspect and Windows Get-NetTCPConnection: `127.0.0.1:27017`. No unrelated listener occupied this port before migration. `MONGO_HOST_PORT` permits an explicit override if needed.
- Replica-set advertisement remains `mongodb:27017`; the backend still uses the internal replica-set URI. Windows clients use directConnection=true to avoid discovery of the Docker-only hostname.

## Executed checks

| Check | Result |
| --- | --- |
| Frontend production build inside Node 24 container | Passed; initial bundle 208.30 kB |
| Backend production build inside Node 24 container | Passed |
| Migrated Compose configuration validation | Passed |
| Both development images build with existing locks | Passed |
| All three services start and become healthy | Passed |
| Frontend HTTP | HTTP 200 |
| Direct API health and database ping | Passed |
| Frontend proxy to backend | Passed |
| Replica-set name / writable primary | rs0 / true |
| Data across infrastructure migration | Passed |
| Data across ordinary `docker compose restart` | Passed; test marker found and removed |
| Health and proxy after restart | Passed |
| Windows localhost TCP reachability | Passed |
| Windows MongoDB protocol connection using Compass URI | Passed; ping, rs0 and writable primary verified |
| Git identity | ouahlineomaima / omaimaouahline@gmail.com |
| Remote history before initialization | Both `git ls-remote` calls returned no advertised references |
| Git origin / primary branch | Correct provided URLs / main in each repository |
| Ignore and staged-file review | Local env, dependencies, outputs, database dumps and backups excluded |

`scripts/verify.ps1` exited 0 with its full PASS result. `scripts/compass-check.cjs` exited 0 when run with the portable Node toolchain on Windows. Compass GUI itself was not launched; the same connection path and URI were verified using Mongoose.

## GitHub authentication blocker

The stored GitHub credential was rejected by the API (HTTP 401). One actual frontend push was attempted and failed with `Invalid username or token`. No push was retried with that credential, and no backend push was attempted after the shared authentication failure. Local initial commits are retained. No remote history was overwritten or force-pushed. Remote upstreams cannot be established until the first successful pushes.

Frontend initial commit: `dbbbebb chore(repo): initialize frontend repository`.

Backend initial commit message: `chore(repo): initialize backend and shared development infrastructure`. The final implementation report supplies its hash. Both commits include repository-specific AGENTS.md instructions for the requested ongoing semantic commit/push workflow.

Manual action: refresh GitHub authentication in Windows Git Credential Manager. Remove the stale GitHub credential in Windows Credential Manager if prompted login is not offered, then run these commands interactively from the parent workspace:

```powershell
git -C phd-quest-frontend push -u origin main
git -C phd-quest-backend push -u origin main
```

If another contributor adds remote commits before these pushes, fetch and inspect them first; do not force-push. After success, use `git branch -vv` and `git status -sb` in each repository to confirm origin/main tracking and synchronization.

Services remain running and healthy. Phase 2 was not started. GitHub publication is the only outstanding part of Phase 1.5.
