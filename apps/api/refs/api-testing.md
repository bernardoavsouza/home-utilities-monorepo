# API — Testing

> **Status:** stable · **Reviewed:** 2026-08-20 · **Source:** monorepo-boilerplate@feat/bff-initial-setup

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Runner

`vitest.config.ts`:

| Setting | Value | Why it matters |
|---|---|---|
| `include` | `src/**/*.spec.ts` | tests are **co-located** with the code, named `*.spec.ts` (`apps/web` uses `*.test.ts` — don't mix them up) |
| `globals` | `true` | `describe` / `it` / `expect` need no import (some specs import them anyway) |
| `environment` | `node` | no DOM |
| `setupFiles` | `./vitest.setup.ts` | env + database reset |
| `fileParallelism` | **`false`** | every file shares one `app_test` database; parallel files would truncate each other |
| plugin | `unplugin-swc` | decorators, so Nest DI works |
| `resolve.alias` | `@` → `./src` | must match `tsconfig.json` and `.swcrc` |

Turborepo runs `test` after `^typecheck` and passes `DATABASE_URL` + `ENVIRONMENT` through.

## Test database lifecycle

`vitest.setup.ts` loads `apps/api/.env.test` with `dotenv`, then `beforeAll` calls
`resetTestDatabase()`. Setup files run **per test file**, so the reset happens once at the start
of each file.

`resetTestDatabase` (`shared/infrastructure/prisma/reset-test-database.ts`) is a **no-op unless
both** guards pass:

| Guard | Requirement |
|---|---|
| `ENVIRONMENT` | exactly `TEST` |
| database name parsed out of `DATABASE_URL` | ends with `_test` |

Then it truncates every table in `public` except `_prisma_migrations`, with
`RESTART IDENTITY CASCADE`. If it cannot connect, it disconnects and returns quietly — tests that
don't need the database still run. This double guard is what makes it impossible to point the
truncate at a dev database; **do not loosen it.**

## HTTP tests

Boot through `createTestApp(SomeModule)` (`shared/infrastructure/http/create-test-app.ts`):
it builds a testing module, applies `configureApp` (prefix, CORS, request id, exception filter,
Swagger — the same as production), and `init()`s. Drive it with Supertest against
`app.getHttpServer()`, and `close()` in `afterAll`.

**Never import `AppModule` in an HTTP test.** Boot the narrowest thing that proves the point — a
spec that boots the whole root module stops testing one seam and starts asserting the whole app.

| Spec | Boots | Proves |
|---|---|---|
| `features/health/presentation/health.controller.spec.ts` | `HealthService` directly, then `HealthModule` | service unit + `GET /v1/health` |
| `features/health/presentation/readiness.controller.spec.ts` | `ReadinessService` with a stub, `HealthModule`, and a local module whose `PrismaService` always fails | `ready`/`not_ready` branches, `200` against real Postgres, `503` with the readiness body shape |
| `shared/infrastructure/http/observability.http.spec.ts` | `HealthModule` | `x-request-id` generated / echoed / rejected when not id-shaped, `ApiErrorBody` on a 404 |
| `shared/infrastructure/http/request-id.spec.ts` | nothing — pure unit | the `sanitizeRequestId` accept/reject matrix |
| `shared/infrastructure/http/swagger.http.spec.ts` | `HealthModule` | the `isSwaggerEnabled` matrix, `/docs` + `/docs-json` served when on and `404` when off |
| `shared/infrastructure/http/cors.http.spec.ts` | a local probe controller/module declared in the spec | CORS matrix without touching a feature |

Booting `HealthModule` pulls `PrismaModule`, but **not** a database connection: Prisma connects
lazily (`api-persistence.md`), so only a spec that actually queries needs Postgres up.

To test a failure of a dependency, declare a module in the spec that overrides the provider with a
failing stub — `readiness.controller.spec.ts` is the pattern. `createTestApp` takes a module, so no
override hook is needed on the helper itself.

## Env-dependent tests

`shared/infrastructure/http/cors.http.spec.ts` is the pattern: capture the original `process.env.CORS_ORIGIN`, mutate it
before booting, restore it in `afterEach` (deleting the key when it was unset). Configuration
is read at boot, so each case needs its own app instance. `swagger.http.spec.ts` does the same for
`SWAGGER_ENABLED` and `NODE_ENV`.

## Database smoke

`shared/infrastructure/prisma/prisma.service.spec.ts` boots `PrismaModule`, calls `$connect()`
explicitly (the service no longer connects on init) and runs `SELECT 1`. It requires Docker Compose
Postgres to be up plus `apps/api/.env.test` — as does the readiness `200` case in
`features/health/presentation/readiness.controller.spec.ts`. Those two are the only specs that
truly need a database.

## Snake_case gate

`shared/infrastructure/prisma/prisma-snake-case-maps.spec.ts` reads the real `schema.prisma` and fails on any unmapped
`camelCase`/`PascalCase` identifier. See `api-persistence.md`.
