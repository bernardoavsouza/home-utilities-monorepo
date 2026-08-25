# Monorepo — Local infrastructure

> **Status:** stable · **Reviewed:** 2026-08-19 · **Source:** monorepo-boilerplate@feat/bff-initial-setup

> **Altitude:** repo ref. File/class/script names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Postgres via Docker Compose

`docker-compose.yml` — Compose project `monorepo-boilerplate`, one service:

| Setting | Value |
|---|---|
| Service / container | `postgres` / `monorepo-boilerplate-postgres` |
| Image | `postgres:16-alpine` |
| Port | `5432:5432` |
| Credentials | user `app` · password `app` · default db `app` |
| Healthcheck | `pg_isready -U app -d app`, 5s interval, 10 retries |
| Volume | `postgres_data` → `/var/lib/postgresql/data` |
| Init scripts | `./docker/postgres/init` mounted read-only |

## Two databases, one server

| Database | Used by | Migrated by |
|---|---|---|
| `app` | local dev / API runtime (`apps/api/.env`) | `pnpm --filter api db:migrate` |
| `app_test` | API tests (`apps/api/.env.test`) and CI | `pnpm --filter api db:migrate:test` |

`pnpm db:migrate` at the root runs **both**, so the two stay in step.

`app_test` is created twice over, on purpose:
- `docker/postgres/init/01-create-test-db.sql` runs **only on an empty volume** (first boot);
- `scripts/bootstrap.mjs` then checks `pg_database` and creates `app` / `app_test` if missing —
  idempotent, and the reason an existing volume still ends up with both.

## `pnpm bootstrap`

`scripts/bootstrap.mjs`, in order — any failure exits non-zero with a fix hint:

| # | Step | Detail |
|---|---|---|
| 1 | engines | Node and pnpm must satisfy the ranges read from root `engines` — otherwise abort |
| 2 | env templates | copy `apps/{api,web}/.env.example` → `.env` when missing; never overwrite |
| 3 | install | `pnpm install` |
| 4 | Postgres | `docker compose up -d --wait` (blocks on the healthcheck), then ensure both databases |
| 5 | Prisma client | `pnpm prisma:generate` |

**Bootstrap does not migrate and does not seed.** After it: `pnpm db:migrate`, then optionally
`pnpm db:seed`. Windows is handled by running the child processes with `shell: true`.

## Destructive operations

| Command | Effect |
|---|---|
| `pnpm db:reset` | `prisma migrate reset --force` on `app` — drops, re-migrates, seeds. Local only |
| `docker compose down -v` | deletes the `postgres_data` volume — both databases are gone; the init script runs again on next boot |

Never point either at anything but a local Compose database.
