# apps/api — AGENTS.md

Index for this app. Read [`../../AGENTS.md`](../../AGENTS.md) first for the repo-wide rules,
the ref-authoring shape, and the living-truth policy.

NestJS + Prisma + PostgreSQL, tested with Vitest and Supertest.

## Routing — `apps/api/refs/`

| Need… | Read |
|---|---|
| global prefix `v1`, CORS, `x-request-id`, validation, error envelope, Swagger gate, liveness vs readiness, ports | `refs/api-http-contract.md` |
| `src/` layout (`features/` vs `modules/` vs `shared/`), when a unit gets `domain/` or `infrastructure/`, module wiring, the `@/*` alias, build targets | `refs/api-architecture.md` |
| Prisma schema, snake_case mapping gate, migrations, seed, `PrismaService` | `refs/api-persistence.md` |
| Vitest setup, test-database reset, `createTestApp`, which module to boot in an HTTP test | `refs/api-testing.md` |

Repo-wide subjects — env vars, the two databases, CI, `@packages/contracts`, **financial module
naming** — are indexed in [`../../AGENTS.md`](../../AGENTS.md). Financial domain work follows
[`../../refs/monorepo-fin-module.md`](../../refs/monorepo-fin-module.md).

## Hard rules

- **`configureApp` is the only place the HTTP envelope is configured.** Prefix, CORS, request id,
  validation pipe, exception filter, and Swagger are applied there so tests and production stay
  identical.
- **Swagger stays gated.** `configureApp` is the production bootstrap, so `/docs` must never be
  mounted unconditionally — off by default in production, `SWAGGER_ENABLED` overrides.
- **Never import `AppModule` in an HTTP test.** Boot `HealthModule` or a probe module declared in
  the spec — a spec that boots the root module stops testing one seam.
- **Liveness never touches a dependency.** `GET /v1/health` is static; anything that can fail
  belongs in readiness (`GET /v1/health/ready`), which reports instead of throwing.
- **Prisma connects lazily.** No `$connect()` in a lifecycle hook — a database outage must not stop
  the API from booting and reporting the outage.
- **Never loosen the `x-request-id` sanitizer** (charset + length cap). It is what keeps a client
  header out of the logs verbatim.
- **Never loosen the test-database reset guards** (`ENVIRONMENT=TEST` **and** a database name
  ending in `_test`). They are what stops a truncate from hitting a dev database.
- **Every Postgres identifier is snake_case** via `@map` / `@@map`. A missing map fails the test
  suite, in CI too.
- **No Prisma model and no product module without a product/spec decision.** `health` is the only
  **feature**; `modules/financial` holds currency domain (PP-48) and grows with later tickets.
- Controllers and response DTOs carry `@nestjs/swagger` decorators; response DTOs `implements`
  the `@packages/contracts` type.
- The `@/*` alias is declared in `tsconfig.json`, `.swcrc`, **and** `vitest.config.ts` — change all
  three together.
- Tests are co-located and named `*.spec.ts` (`apps/web` uses `*.test.ts`).

## Keeping these refs current

Full policy — the trigger table and the closing checklist — is in
[`../../AGENTS.md`](../../AGENTS.md) § *Keeping refs current*. It applies here. In short:

- **New feature under `src/features/<name>/` or module under `src/modules/<name>/` that carries
  rules of its own → new ref** `refs/api-<name>.md`, plus a row in the routing table above, in the
  same PR.
- Changed an existing rule, HTTP contract, Prisma mapping, command, or test constraint → **update
  the ref that covers it** and bump `Reviewed:`.
- Found a ref that contradicts the code → fix the ref now; the code wins.

A ref for this app goes in `apps/api/refs/api-<subject>.md` — never at the repo root.
