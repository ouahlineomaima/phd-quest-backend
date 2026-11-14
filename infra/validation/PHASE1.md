# Phase 1 validation — 2026-11-14

## Selected and resolved versions

| Technology | Version |
| --- | --- |
| Angular core | 22.2.6 |
| Angular CLI/build | 22.2.7 |
| Frontend TypeScript | 6.0.3 |
| NestJS core | 11.2.10 |
| Backend TypeScript | 5.9.3 |
| Mongoose | 8.24.9 |
| Container Node.js | 24.22.3 |
| MongoDB | 8.0.38 |
| Docker Engine | 29.2.1 |

Angular 22 is a current stable release. Compatibility was checked against https://angular.dev/reference/versions. NestJS 11 was selected as a compatible stable release for the Config 4 / Mongoose integration 11 stack. Lockfiles contain the exact full dependency graph.

## Executed checks

| Check | Result |
| --- | --- |
| Parent has no `.git`; two child repositories initialized | Passed; no commits created |
| Angular production build, `npm run build` | Passed; initial bundle 208.30 kB |
| NestJS build, `npm run build` | Passed |
| `docker compose config --quiet` | Passed |
| Both Docker images build using `npm ci` | Passed |
| All three Compose health checks | Passed |
| Frontend HTTP at localhost:4200 | HTTP 200 |
| Direct `/api/health` at localhost:3000 | Passed, status ok / database up |
| Proxied `/api/health` at localhost:4200 | Passed, status ok / database up |
| NestJS Mongoose connection | Initialized successfully in container logs; health database ping passed |
| Replica-set readiness | rs0, writable primary true |
| Test document survives `docker compose down` and `up` | Passed; document confirmed after restart, then deleted |
| Backend production dependency audit | Zero vulnerabilities |

The complete `scripts/verify.ps1` run exited successfully and printed its PASS result. Final `docker compose ps` showed all three services healthy. Frontend and backend watch modes started successfully; polling is configured for Windows bind mounts. Application UI is intentionally blank.

## Resolved setup problems and remaining notes

- Node.js was absent from the initial shell. A checksum-verified portable Node 24 toolchain was downloaded to the temporary directory; no global installation was made. Docker provides Node for the normal workflow.
- Docker Desktop was initially stopped. It was started for validation.
- The first image build started before npm generated lockfiles and failed at `npm ci`. It was rerun successfully once both lockfiles existed.
- Docker Desktop returned transient EOF errors during container creation. Recreation and subsequent startup succeeded. An optional anonymous Angular cache mount also failed; that unnecessary mount was removed. The final persistence test completed through a full fresh container recreation.
- Full backend dependency installation reported two low and three moderate advisories in development tooling. The separate production-only audit reported none. No forced major dependency upgrades were applied.
- No required manual configuration remains for the default Compose workflow. Services are left running. The existing PDF is unchanged. Phase 2 was not started.
