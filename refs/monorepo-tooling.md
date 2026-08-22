# Monorepo — Tooling

> **Status:** stable · **Reviewed:** 2026-08-21 · **Source:** monorepo-boilerplate@feat/bff-initial-setup

> **Altitude:** repo ref. File/class/script names are **implementation anchors** (they drift);
> the rule does not depend on them.

## Toolchain

| Thing | Value | Enforced by |
|---|---|---|
| Node | `>=26 <27` (`.nvmrc` → `26`) | `engines.node`, `engine-strict=true` in `.npmrc`, `scripts/bootstrap.mjs` |
| Package manager | pnpm `>=11 <12`, pinned `pnpm@11.20.0` | `engines.pnpm`, `packageManager`, `scripts/bootstrap.mjs` |
| npm / yarn | **blocked** | `preinstall: npx only-allow pnpm` |
| TypeScript | `5.9.3`, pinned in every workspace | per-package `devDependencies` |
| Task runner | Turborepo `^2.5.4` | `turbo.json` |

`engine-strict=true` means a wrong Node/pnpm fails the install, not just warns.

## Workspaces

Globs in `pnpm-workspace.yaml`: `apps/*`, `packages/*`.

| Path | Package name | Role | Build |
|---|---|---|---|
| `apps/web` | `web` | Next.js App Router | `next build` |
| `apps/api` | `api` | NestJS HTTP API | `nest build` (SWC builder, `typeCheck: true` in `nest-cli.json`) |
| `packages/contracts` | `@packages/contracts` | shared types, source-only | **none** — typecheck only |

Do not add another `packages/*` without a product/spec reason.

## Dependency build scripts (`allowBuilds`)

`pnpm-workspace.yaml` allowlists which dependencies may run install scripts. Current state:

| Allowed | Blocked |
|---|---|
| `prisma`, `@prisma/client`, `@prisma/engines`, `@swc/core` | `@scarf/scarf`, `sharp`, `unrs-resolver` |

Adding a dependency with a postinstall/build step means adding it here, or its build is skipped.

## Root scripts

| Command | Does |
|---|---|
| `pnpm bootstrap` | `scripts/bootstrap.mjs` — engines, env templates, install, Postgres, `prisma generate`. **Does not migrate or seed.** See `monorepo-infra-local.md` |
| `pnpm build` / `typecheck` / `test` / `lint` | `turbo run <task>` across workspaces |
| `pnpm dev:api` / `pnpm dev:web` | `pnpm --filter api dev` (:3001) / `--filter web dev` (:3000) |
| `pnpm prisma:generate` | `--filter api prisma:generate` |
| `pnpm db:migrate` | `--filter api db:migrate` **and** `db:migrate:test` — applies to `app` **and** `app_test` |
| `pnpm db:seed` | `--filter api db:seed` (no-op until domain models exist) |
| `pnpm db:reset` | `--filter api db:reset` — **destructive**, local only |

Root-level tasks always go through `turbo run`; don't add a root script that loops over workspaces by hand.

## Turborepo task graph

| Task | `dependsOn` | Outputs / notes |
|---|---|---|
| `build` | `^build` (upstream first) | `dist/**`, `.next/**` except `.next/cache/**`; `env: NEXT_PUBLIC_*, NEXT_OUTPUT`; `inputs` include `.env` / `.env.*` |
| `typecheck` | `^typecheck` | no outputs (not cached as artifacts) |
| `test` | `^typecheck` — typecheck runs before tests | `passThroughEnv: DATABASE_URL, ENVIRONMENT` |
| `lint` | — | no outputs |
| `dev` | — | `cache: false`, `persistent: true` |

`envMode` is Turborepo's default **`strict`**. Use `env` when the value must change the cache key
(`NEXT_PUBLIC_*` is inlined into the bundle, so a different URL *must* be a different hash) and
`passThroughEnv` when it must not (`DATABASE_URL`).

`$TURBO_DEFAULT$` skips gitignored files, and Next also reads `apps/<app>/.env` itself — so
`build.inputs` explicitly lists `.env` and `.env.*` (relative to each package). Without that, a
local change to `apps/web/.env` can cache-hit a bundle that still has the old `NEXT_PUBLIC_*`
inlined. CI escapes this because it sets those vars in the process environment.

## `@/*` alias

Per-app only: `@/*` → **that app's** `src/*`. There is no cross-app `@/` import. Cross-app
types come from `@packages/contracts` (see `monorepo-contracts.md`). In `apps/api` the alias
is declared in three places that must stay in sync — see `apps/api/refs/api-architecture.md`.
