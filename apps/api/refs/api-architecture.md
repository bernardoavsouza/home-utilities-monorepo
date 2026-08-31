# API — Architecture

> **Status:** stable · **Reviewed:** 2026-08-31 · **Source:** home-utilities-monorepo@feat/PP-48-currency-catalog-money

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Layout

```text
src/
  main.ts                     bootstrap: logger + configureApp + listen
  app.module.ts               root module
  features/<name>/            cross-cutting / boilerplate features (e.g. health)
    <name>.module.ts
    application/              services
    presentation/             controllers, DTOs
  modules/<name>/             product bounded contexts (e.g. financial)
    <name>.module.ts          when Nest DI is needed
    application/
    presentation/
    domain/                   only when domain rules exist
    infrastructure/           only when the module owns an adapter
  shared/                     shared kernel (geral)
    infrastructure/http/
    infrastructure/observability/
    infrastructure/prisma/
```

`features`, `modules`, and `shared` are **siblings** under `src/`.

| Home | Holds | Examples |
|---|---|---|
| `features/` | Geral — health, readiness, future cross-app concerns that are not a product BC | `features/health` |
| `modules/` | Encapsulated product domain — same layer rules as features, private to that BC | `modules/financial` |
| `shared/` | Kernel used across features/modules (Prisma, HTTP config, logging) | `shared/infrastructure/prisma` |

Code inside a module must not be imported by another module’s internals. Cross-module types go
through `@packages/contracts` (or an explicit Nest export when a module is wired).

## The four layers, and when they appear

| Layer | Holds | Create it… |
|---|---|---|
| `presentation` | controllers, request/response DTOs | always (when the unit has HTTP) |
| `application` | services, orchestration | always (when the unit has use-cases) |
| `domain` | types and rules that are not just the HTTP/service layer | **only** when such rules exist |
| `infrastructure` | an adapter the unit owns (DB, HTTP client, queue) | **only** when it owns one |

Do **not** scaffold four empty folders. `health` is `application` + `presentation` only.
`modules/financial` today is **domain only** (currency catalog / Money helpers) until
application/presentation land with later tickets.

The same layer rules apply under `features/<name>/` and under `modules/<name>/`.

## Module wiring

| Module | Provides |
|---|---|
| `AppModule` | imports `PrismaModule` + `HealthModule` (+ product modules when wired) — the only place they are registered |
| `HealthModule` | imports `PrismaModule`; liveness + readiness controllers/services |
| `PrismaModule` | `@Global()`, exports `PrismaService` — see `api-persistence.md` |
| `FinancialModule` | **not wired yet** — add when the first Nest provider/controller for financial needs DI |

`HealthModule` imports `PrismaModule` even though it is `@Global()`: the explicit import is what
lets an HTTP test boot `HealthModule` on its own, without `AppModule`.

- New **geral** feature = `features/<name>/<name>.module.ts` + import in `AppModule`.
- New **product** BC = `modules/<name>/` + `<name>.module.ts` + import in `AppModule` when DI exists.

Financial domain work follows `../../../refs/monorepo-fin-module.md`. Do not invent a parallel
`features/budget` or `modules/budget` top-level BC for the same domain.

## The `@/*` alias is declared three times

`@/*` → `src/*`. Prefer `@/features/…`, `@/modules/…`, and `@/shared/…` over deep relative paths.
Three toolchains resolve it independently and **all three must agree**:

| Toolchain | Declared in |
|---|---|
| `tsc` (typecheck) | `tsconfig.json` → `compilerOptions.paths` |
| `nest build` (SWC builder, per `nest-cli.json`) | `.swcrc` → `jsc.baseUrl` + `jsc.paths` |
| Vitest | `vitest.config.ts` → `resolve.alias` |

Changing or adding an alias means editing all three, then verifying with `pnpm typecheck`,
`pnpm --filter api build`, and `pnpm --filter api test`.

Cross-app types come from `@packages/contracts` with `import type`; there is no `@/` import
across apps.

## Compile targets

| Path | Compiler | Notes |
|---|---|---|
| `pnpm --filter api build` | `nest build` with the SWC builder, `typeCheck: true`, `deleteOutDir: true` | emits `dist/` |
| `pnpm --filter api typecheck` | `tsc -p tsconfig.build.json --noEmit` | excludes `**/*spec.ts` |
| tests | Vitest + `unplugin-swc` | decorators via `legacyDecorator` + `decoratorMetadata` |

Decorator metadata is required by Nest DI — anything that changes the SWC or tsconfig decorator
settings breaks injection at runtime, not at compile time.

## Scope rule

No product module and no Prisma model without a product/spec decision. `health` is the only
**feature** until a spec says otherwise; `modules/financial` holds currency domain from PP-48
and grows with later financial tickets.
