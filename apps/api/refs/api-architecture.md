# API — Architecture

> **Status:** stable · **Reviewed:** 2026-08-30 · **Source:** home-utilities-monorepo@feat/PP-47-fin-naming-convention

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Layout

```text
src/
  main.ts                     bootstrap: logger + configureApp + listen
  app.module.ts               root module
  features/<name>/            one folder per feature
    <name>.module.ts
    application/              services
    presentation/             controllers, DTOs
  shared/                     shared kernel
    infrastructure/http/
    infrastructure/observability/
    infrastructure/prisma/
```

`features` and `shared` are **siblings** under `src/`.

## The four layers, and when a feature gets them

| Layer | Holds | Create it… |
|---|---|---|
| `presentation` | controllers, request/response DTOs | always |
| `application` | services, orchestration | always |
| `domain` | types and rules that are not just the HTTP/service layer | **only** when such rules exist |
| `infrastructure` | an adapter the feature owns (DB, HTTP client, queue) | **only** when the feature owns one |

Do **not** scaffold four empty folders into a new feature. `health` is `application` +
`presentation` only, and that is the correct shape for it.

Cross-cutting infrastructure (Prisma, HTTP config, logging) lives under `shared/`, not in a feature.

## Module wiring

| Module | Provides |
|---|---|
| `AppModule` | imports `PrismaModule` + `HealthModule` — the only place feature modules are registered |
| `HealthModule` | imports `PrismaModule`; `HealthController` + `HealthService` (liveness) and `ReadinessController` + `ReadinessService` (readiness) |
| `PrismaModule` | `@Global()`, exports `PrismaService` — see `api-persistence.md` |

`HealthModule` imports `PrismaModule` even though it is `@Global()`: the explicit import is what
lets an HTTP test boot `HealthModule` on its own, without `AppModule`.

A new feature = `features/<name>/<name>.module.ts` + an import in `AppModule`.

The financial applet is **`features/fin/`** (routes `/v1/fin/…`, tables `fin_*`). Naming and
boundary rules: `../../../refs/monorepo-fin-applet.md`. Do not invent a parallel
`features/budget` top-level feature for the same domain.

## The `@/*` alias is declared three times

`@/*` → `src/*`. Prefer `@/features/…` and `@/shared/…` over deep relative paths. Three
toolchains resolve it independently and **all three must agree**:

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

No domain feature and no Prisma model without a product/spec decision. `health` is the only
feature until a spec says otherwise.
