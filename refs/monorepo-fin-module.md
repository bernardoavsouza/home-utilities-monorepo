# Monorepo — Fin module (naming & boundary)

> **Status:** draft · **Reviewed:** 2026-08-30 · **Source:** home-utilities-monorepo@feat/PP-47-fin-naming-convention

> **Altitude:** repo ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## What it is

`fin` is the **financial module** inside Home Utilities: one bounded context for ledger,
budget, categories, currencies, debts, and projection. It is **not** a separate
deployable — same BFF, same Postgres, same user — with an explicit namespace so other modules
cannot collide on `accounts` / `categories` / `transactions`.

## Naming split

| Layer | Convention | Example |
|---|---|---|
| Postgres table / enum | `fin_<snake>` via `@@map` / `@map` | `fin_accounts`, `fin_budgets` |
| Prisma model | `Fin` + PascalCase | `FinAccount`, `FinBudget` |
| Prisma fields | camelCase + `@map` snake_case (existing persistence gate) | `createdAt` → `created_at` |
| API feature folder | `apps/api/src/features/fin/` | Nest `FinModule` |
| API routes | under global prefix `v1`, then `fin/…` | `/v1/fin/…` |
| Web feature folder | `apps/web/src/features/fin/` | panel UI for the module |
| Contracts ownership | `packages/contracts/src/fin/` + `Fin*` type names | `FinBudgetHomeResponse` (barrel is flat — folder alone is not the namespace) |
| UI copy | product language, **no** `fin` prefix required | “Orçamento”, “Categorias” |

`fin` = module. `budget` = **feature/panel inside** `fin` (e.g. table `fin_budgets`),
not a second top-level namespace.

## What must not get a `fin_` prefix

| Thing | Why |
|---|---|
| Auth, user, session, health, readiness | Cross-cutting / other features |
| Shared infra (`shared/infrastructure/…`) | Not domain |
| Shared money primitives (`Money`, `CurrencyCode`) | Cross-module; stay at `packages/contracts/src/money.ts` |
| UI strings and route page titles | Product copy |
| Double prefixes (`fin_fin_…`, `fin_budget_budget_…`) | Noise; one module prefix is enough |

## Code layout

Canonical layout for the fin module (create folders only when they hold real code — no empty
scaffolds):

```text
apps/api/src/features/fin/
  fin.module.ts
  application/
  presentation/          # controllers under /v1/fin/…
  domain/                # only when real domain rules exist
  infrastructure/        # only if the feature owns an adapter

apps/web/src/features/fin/
  …                      # budget month UI and related panels
```

`fin` is **one** Nest/web feature folder for the module. Internal panels (budget, ledger,
categories) are subfolders/concepts inside it — not separate `features/fin-budget` apps and
not extra table prefixes.

Wiring: import `FinModule` from `AppModule` (same pattern as `HealthModule` in
`apps/api/refs/api-architecture.md`).

There is **no** `features/fin/` tree and **no** fin Prisma model in `schema.prisma` today.

## Persistence

Builds on `apps/api/refs/api-persistence.md` (PascalCase models, snake_case DB, map gate).

| Rule | Detail |
|---|---|
| Every fin table/enum maps to `fin_…` | e.g. model `FinAccount` → `@@map("fin_accounts")` |
| No bare financial tables | `accounts`, `categories`, `budgets` without `fin_` are wrong |
| Money always has currency | amount + currency; currency codes come from the shared `CurrencyCode` primitive |

The `fin_` table prefix is a convention today. Extend the existing snake_case map gate
(`apps/api/src/shared/infrastructure/prisma/prisma-snake-case-maps.ts`) to enforce the prefix
when the first fin model lands.

## HTTP

Global prefix remains `v1` (`apps/api/refs/api-http-contract.md`). Fin controllers register
paths as `fin/…` so the public surface is `/v1/fin/…`. Health stays `/v1/health` (not under
`fin`).

## Contracts

`@packages/contracts` stays types-only (`refs/monorepo-contracts.md`).

| Rule | Detail |
|---|---|
| Ownership | Budget, income, transaction/posting, debts, projection, and dashboard panel types are **fin module** contracts |
| Shared (not fin-owned) | `Money` and `CurrencyCode` stay in `packages/contracts/src/money.ts` — shared primitives any module may use |
| New fin types | Put them under `packages/contracts/src/fin/` **and** prefix type names with `Fin` (`FinCategory`, `FinBudgetHomeResponse`). The package entry point re-exports flat (`import type { … } from '@packages/contracts'`), so the folder alone is not a consumer-facing namespace — the `Fin` prefix is the collision boundary |
| Migration trigger | Existing files (`budget.ts`, `income.ts`, `dashboard.ts`, …) predate this boundary. Migrate each file into `src/fin/` **and** rename exported types to `Fin*` in the **same PR** that creates the Nest endpoint for that panel |

Do not rename contracts in a docs-only PR.

## Hard rules

- No financial Prisma model or `/v1/fin` controller without following this naming.
- No second top-level prefix for budget/ledger/categories (`budget_*` tables are wrong).
- UI may say “Orçamento”; schema and API stay `fin`.
- Specs and plans for the financial domain cite this ref instead of inventing another prefix.

## Related refs

| Subject | Ref |
|---|---|
| API layout / features | `apps/api/refs/api-architecture.md` |
| Prisma / snake_case gate | `apps/api/refs/api-persistence.md` |
| HTTP prefix `v1` | `apps/api/refs/api-http-contract.md` |
| Shared contracts | `refs/monorepo-contracts.md` |
| Web features layout | `apps/web/refs/web-architecture.md` |
