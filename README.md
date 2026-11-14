# PhD Quest backend

Shared Docker Compose configuration, Compass setup, environment examples and verification scripts are tracked in [infra/README.md](infra/README.md). Start both sibling repositories with `cd infra` followed by `docker compose up -d --build`. Stop with `docker compose down`. Main branch: https://github.com/ouahlineomaima/phd-quest-backend.

NestJS 11, TypeScript, environment configuration and Mongoose. Run `npm ci` and `npm run build` with Node 24.15+ (24.x). For host development copy `.env.example` to `.env`, provide a reachable MongoDB replica set URI, and run `npm run start:dev`.

Compose supplies environment values directly. Environment validation rejects missing MongoDB URIs, invalid ports and malformed CORS origins. HTTP routes use `/api`; requests pass through a global validation pipe with transformation, whitelisting and rejection of unknown properties. CORS accepts the configured comma-separated origins.

`GET /api/health` returns `{"status":"ok","database":"up"}` after a successful database ping, otherwise HTTP 503. The health module is the only feature module in this phase. Controllers delegate to services.

Every future feature must preserve this structure:

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

Empty health-layer directories are intentional placeholders. No database model or repository is needed for a connectivity ping. The Dockerfile provides development hot reload; Compose enables TypeScript file polling for bind mounts.
