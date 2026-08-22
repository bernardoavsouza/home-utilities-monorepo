# monorepo-boilerplate

pnpm monorepo scaffold: Next.js (`apps/web`) + NestJS (`apps/api`), with shared types in `packages/contracts` (`@packages/contracts`).

## Prerequisites

- **Node 26** (see `.nvmrc`; e.g. 26.7.0 via nvm/fnm/asdf)
- **pnpm 11.20.0** (Corepack; `packageManager` field)
- **Docker** (Postgres for local API / Prisma smoke tests)

## Setup

```bash
nvm install && nvm use   # Node 26
corepack enable          # pnpm from packageManager
pnpm bootstrap
pnpm db:migrate   # apply versioned migrations (Postgres must be up)
pnpm db:seed      # no-op seed until domain models exist (optional after migrate)
```

`pnpm bootstrap` is the canonical local setup. It:

1. Checks Node / pnpm engines
2. Copies env templates if missing (never overwrites existing `.env` files)
3. Runs `pnpm install`
4. Starts Postgres via `docker compose up -d --wait` (blocks until the healthcheck passes)
5. Runs `pnpm prisma:generate`

Bootstrap does **not** run migrations or seed. After bootstrap, apply migrations with `pnpm db:migrate` and optionally `pnpm db:seed`.

- `pnpm db:migrate` applies committed migrations (`prisma migrate deploy`).
- Creating new migrations after schema changes: `pnpm --filter api prisma:migrate:dev` (or `prisma migrate dev` in `apps/api`) — **not** the same as `pnpm db:migrate`.
- `pnpm db:reset` is **destructive (local only)**: drops the database, re-applies migrations, runs seed.

Env templates (no secrets):

| Template | Target (created on first bootstrap if missing) |
|----------|------------------------------------------------|
| `apps/api/.env.example` | `apps/api/.env` (`DATABASE_URL` → `app`, `PORT`, `CORS_ORIGIN`, `SWAGGER_ENABLED`) — Nest scripts and Prisma CLI |
| `apps/web/.env.example` | `apps/web/.env` (`NEXT_PUBLIC_API_URL`) |

Env files live per app. There is no root `.env`. API runtime and Prisma migrate/seed read `apps/api/.env` (database `app`). API tests load `apps/api/.env.test` (`ENVIRONMENT=TEST`, database `app_test`) and truncate that database at the start of each Vitest file. `pnpm db:migrate` applies migrations to both `app` and `app_test`.

## Run

```bash
pnpm dev:api   # NestJS on :3001, global prefix v1
pnpm dev:web   # Next.js on :3000
```

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm bootstrap` | Engines check, env templates, install, Postgres, prisma generate (does not migrate) |
| `pnpm db:migrate` | Apply Prisma migrations (`migrate deploy`) |
| `pnpm db:seed` | Run Prisma seed (currently no-op) |
| `pnpm db:reset` | **Destructive** local reset: drop DB → migrate → seed |
| `pnpm dev:web` | Next.js on **:3000** |
| `pnpm dev:api` | NestJS on **:3001** with global prefix `v1` |
| `pnpm typecheck` | Typecheck all workspaces (Turborepo) |
| `pnpm test` | Vitest in web (jsdom component tests) + api (needs Postgres; Turborepo) |
| `pnpm lint` | ESLint where configured (Turborepo) |
| `pnpm build` | Build apps that define `build` (Turborepo) |
| `pnpm --filter web test:e2e` | Playwright e2e — boots **both** the API and the web app |
| `pnpm prisma:generate` | Generate Prisma client (`apps/api`) |
| `docker build -f apps/<app>/Dockerfile .` | Build an app image (see [Docker images](#docker-images)) |

## Health

```bash
curl -i http://localhost:3001/v1/health         # liveness  → 200 {"status":"ok"}
curl -i http://localhost:3001/v1/health/ready   # readiness → 200 / 503 + database status
```

Liveness is static and never touches the database. Readiness runs `SELECT 1` and answers `503`
with `{"status":"not_ready","dependencies":{"database":"down"}}` when Postgres is unreachable —
the API still boots and serves liveness in that case, because Prisma connects lazily.

OpenAPI UI: [http://localhost:3001/docs](http://localhost:3001/docs) (`/docs-json` for the spec).
**Swagger is off by default in production** — `SWAGGER_ENABLED=true` opts back in, and
`SWAGGER_ENABLED=false` turns it off anywhere else.

API observability: Nest logs only (JSON in production), global error JSON (`ApiErrorBody`), `x-request-id` correlation (client-supplied ids are only reused when they are `[A-Za-z0-9._-]` and at most 128 chars).

Request bodies go through a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`,
`transform`), so an unknown property is a `400` rather than silently accepted.

## Docker images

One Dockerfile per app, both built **from the repo root** (the lockfile, `pnpm-workspace.yaml` and
`packages/contracts` live above each app):

```bash
docker build -f apps/api/Dockerfile -t monorepo-boilerplate-api .
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001/v1 \
  -t monorepo-boilerplate-web .

docker run --rm -p 3001:3001 -e DATABASE_URL=... monorepo-boilerplate-api
docker run --rm -p 3000:3000 monorepo-boilerplate-web
```

Both take pnpm from Corepack at the `packageManager` version, run as non-root, and read no `.env`
file.

**API image**

- The Prisma client is generated with the `prisma` version in the lockfile.
- **Migrations are not run on start.** Run them as a separate deploy step against the same image:
  `docker run --rm -e DATABASE_URL=... monorepo-boilerplate-api ./node_modules/.bin/prisma migrate deploy`
  (the binary directly — the image has no writable workspace for `pnpm exec` to verify).

**Web image**

- Uses Next's `output: 'standalone'`, so the runtime stage carries no pnpm and no install step.
- **`NEXT_PUBLIC_API_URL` is baked in at build time** — it is inlined into the client bundle by
  `next build`, so passing it to `docker run` does nothing. A different API URL means a new image.

CI builds both images on every PR, so neither Dockerfile can rot.

## Tooling notes

- **Node** `>=26 <27`, **pnpm** `>=11 <12` (`engines` + `engine-strict=true` in `.npmrc`)
- npm/yarn installs are blocked via `only-allow pnpm`
- **TypeScript 5.9.3** (pinned; Next/Nest + typescript-eslint do not support TS 7 yet)
- **Prisma 6.x** (not 7 — schema URL API)
- Path aliases: `@/*` → each app's own `src/*` (no cross-app `@/` imports)
- Shared contracts: `@packages/contracts` (`packages/contracts`) — types only; use `import type`
- **Turborepo** orchestrates `build` / `typecheck` / `test` / `lint` with a task graph + local cache (see `turbo.json`)
- **CI**: GitHub Actions, **one workflow per app per concern** (`api-checks`, `api-tests`, `api-image`, `web-checks`, `web-tests`, `web-image`), all triggered **only by pull requests targeting `main`** (no `push` trigger). Shared setup lives in `.github/actions/setup`. The API tests and the Playwright e2e each get a Postgres 16 service and `app_test`; the e2e job boots the API next to the web app, so no deployed environment is involved. `packages/contracts` has no workflow — its typecheck runs as an upstream dependency of both apps.

## VS Code debug

Launch configs live in [`.vscode/launch.json`](.vscode/launch.json):

- **API: Nest debug** — `pnpm --filter api start:debug` (Node 26)
- **Web: Next dev** — `pnpm --filter web dev` (Node 26)

## Docs for agents

- [`AGENTS.md`](AGENTS.md) — monorepo conventions
- [`apps/web/AGENTS.md`](apps/web/AGENTS.md) — Next App Router layout & tests
- [`apps/api/AGENTS.md`](apps/api/AGENTS.md) — Nest features, Prisma, health contract
