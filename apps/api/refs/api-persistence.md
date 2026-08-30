# API — Persistence

> **Status:** stable · **Reviewed:** 2026-08-30 · **Source:** home-utilities-monorepo@feat/PP-47-fin-naming-convention

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Schema

`prisma/schema.prisma` — `prisma-client-js` generator, `postgresql` datasource reading
`env("DATABASE_URL")`. **It holds no domain model today**, and stays that way until a product
or spec decision adds one. Prisma is pinned to 6.x (not 7 — the schema URL API differs).

## snake_case in the database is enforced by a test

Naming split: JS/Prisma side is `PascalCase` models and `camelCase` fields; Postgres side is
snake_case, mapped explicitly.

| Prisma identifier | Requires |
|---|---|
| model `OrderItem` | `@@map("order_item")` |
| field `createdAt` | `@map("created_at")` |
| enum `OrderStatus` | `@@map("order_status")` |
| enum value `AwaitingPayment` | `@map("awaiting_payment")` |
| relation field (type is another model) | **nothing** — not a column |
| identifier already snake_case | nothing — the map would be a no-op |

`collectPrismaSnakeCaseViolations` (`shared/infrastructure/prisma/prisma-snake-case-maps.ts`)
parses the schema text and returns one violation per missing map; its spec asserts the real
schema is clean. So an unmapped `camelCase` identifier **fails `pnpm test`**, in CI too — this
is a gate, not a style suggestion.

### Financial module tables

Fin tables and enums use the `fin_` prefix on the Postgres side (model `FinAccount` →
`@@map("fin_accounts")`). There are no bare `accounts` / `budgets` / `categories` tables.
Full boundary: `../../../refs/monorepo-fin-module.md`.

## Commands

| Command | Effect | Target DB |
|---|---|---|
| `pnpm prisma:generate` (root or `--filter api`) | regenerate the client | — |
| `pnpm --filter api prisma:migrate:dev` | **create** a migration from schema changes | `app` |
| `pnpm --filter api db:migrate` | `prisma migrate deploy` — apply committed migrations | `app` |
| `pnpm --filter api db:migrate:test` | `migrate deploy` with `.env.test` | `app_test` |
| `pnpm db:migrate` (root) | both of the above | `app` **and** `app_test` |
| `pnpm db:seed` | `prisma db seed` → `prisma/seed.ts` via `ts-node --transpile-only` | `app` |
| `pnpm db:reset` | `prisma migrate reset --force` — **destructive**, local only | `app` |

Creating a migration and applying one are different commands: `db:migrate` never generates SQL.
Migrations are versioned under `prisma/migrations` (`20260807165354_init` + `prisma/migrations/migration_lock.toml`)
and are always committed.

The Prisma CLI reads **`apps/api/.env` only** — there is no root `.env`. See
`../../../refs/monorepo-env-secrets.md`.

## Runtime access

| Piece | Behavior |
|---|---|
| `PrismaService` | `@Injectable()`, extends `PrismaClient`, `$disconnect()` on `OnModuleDestroy` |
| `PrismaModule` | `@Global()` — provides and exports `PrismaService` |

### The connection is lazy, on purpose

`PrismaService` does **not** `$connect()` on `OnModuleInit`. `PrismaClient` connects on its first
query, so a Postgres outage cannot stop the API from booting: the process comes up and liveness
answers `200` while readiness reports the database `down`
(`../refs/api-http-contract.md` § *Liveness vs readiness*).

Re-adding an eager `$connect()` in a lifecycle hook makes the whole boot depend on the database
again — including the ability to say that the database is missing. Code that needs a connection up
front opens it explicitly (`shared/infrastructure/prisma/prisma.service.spec.ts` does).

Because the module is global, `PrismaService` can be injected anywhere once **some** module imports
`PrismaModule`. `HealthModule` imports it explicitly — readiness needs it, and the explicit import
is what lets an HTTP test boot `HealthModule` alone. `AppModule` also imports it, which is what
makes it available to every other feature.

### The `prisma` CLI is a runtime dependency

`prisma` sits in `dependencies`, not `devDependencies`, so the Docker image can run
`prisma migrate deploy` as a separate deploy step and `prisma generate` in the stage that ships.
It costs ~120MB of image — see `../../../refs/monorepo-docker-images.md`.

## Seed

`prisma/seed.ts` connects a `PrismaClient`, runs an empty `main()`, disconnects, and exits 1 on
error. It stays a no-op until domain models exist.
