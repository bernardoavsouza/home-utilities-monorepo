# Monorepo — Env and secrets

> **Status:** stable · **Reviewed:** 2026-08-20 · **Source:** monorepo-boilerplate@feat/bff-initial-setup

> **Altitude:** repo ref. File/class/script names are **implementation anchors** (they drift);
> the rule does not depend on them.

## There is no root `.env`

Env is **per app**. A root `.env` / `.env.example` must not exist — it was deliberately removed.
Anything shared belongs in the per-app template of every app that needs it.

## The files

| File | Purpose | In git? |
|---|---|---|
| `apps/api/.env.example` | template for the API (no secrets) | yes |
| `apps/api/.env` | API runtime **and** Prisma CLI | no |
| `apps/api/.env.test` | API test env — `app_test` database | **yes** (whitelisted in `.gitignore`) |
| `apps/web/.env.example` | template for the web app | yes |
| `apps/web/.env` | web runtime | no |

`.gitignore` ignores `.env` / `.env.*` broadly and re-includes only `apps/*/.env.example`
and `apps/api/.env.test`. `.env.test` is committed because it holds local-only, non-secret
values and CI depends on it.

## The variables

| Var | App | Value in the template | Read by |
|---|---|---|---|
| `DATABASE_URL` | api | `postgresql://app:app@localhost:5432/app?schema=public` | `PrismaService`, Prisma CLI, `resetTestDatabase` |
| `PORT` | api | `3001` | `main.ts` (`process.env.PORT ?? 3001`) |
| `CORS_ORIGIN` | api | `http://localhost:3000` | `parseCorsOrigin` — see `apps/api/refs/api-http-contract.md` |
| `SWAGGER_ENABLED` | api | `true` | `isSwaggerEnabled` — `'true'` opts in, anything else opts out; unset falls back to `NODE_ENV !== 'production'` |
| `NODE_ENV` | api | not in the template | Nest logger format (`app-logger.ts`) **and** the Swagger default — `production` turns `/docs` off |
| `ENVIRONMENT` | api (test only) | `TEST` | test-database reset guard |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:3001/v1` | browser code; **already includes the `/v1` prefix**; inlined by `next build`, so it is build-time only |
| `NEXT_OUTPUT` | web (build only) | not in the template | `next.config.ts` — `standalone` opts into the standalone build; set by `apps/web/Dockerfile`, nowhere else |

## Which process loads which file

| Process | Loads |
|---|---|
| `pnpm --filter api dev` / `start` / `start:prod` | `apps/api/.env` via `node --env-file-if-exists=.env` |
| Prisma CLI (`generate`, `migrate deploy`, `migrate dev`, `db seed`, `migrate reset`) | `apps/api/.env` |
| `pnpm --filter api db:migrate:test` | `apps/api/.env.test` via `--env-file-if-exists=.env.test` |
| API Vitest | `apps/api/.env.test` — loaded by `vitest.setup.ts` (and again in `apps/api/src/shared/infrastructure/prisma/prisma.service.spec.ts`) via `dotenv` |
| CI | no `.env` for the API — `DATABASE_URL` / `ENVIRONMENT` come from the workflow `env`; `.env.test` is present because it is committed |
| Next.js (`apps/web`) | `apps/web/.env` (framework-native) |
| the API image | **no `.env` at all** — `NODE_ENV` / `PORT` are baked in, the rest is passed at `docker run` / deploy time (`monorepo-docker-images.md`) |
| the web image | **no `.env` at all** — `NEXT_PUBLIC_API_URL` is a `--build-arg`, inlined into the bundle at build time; passing it at `docker run` does nothing |

## Rules

- **No secrets in git.** Templates carry placeholder/local values only.
- `pnpm bootstrap` copies `*.env.example` → `.env` **only when the target is missing** — it never
  overwrites an existing `.env`.
- Adding a var: add it to the app's `.env.example`, to `.env.test` if tests need it, list it in
  the table above, and add it to `passThroughEnv` in `turbo.json` if a Turborepo task must see it.
- Web vars exposed to the browser need the `NEXT_PUBLIC_` prefix; anything without it is
  server-only. Never put a secret behind `NEXT_PUBLIC_`.
