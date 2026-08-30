# Monorepo — Fin applet (naming & boundary)

> **Status:** stable · **Reviewed:** 2026-08-30 · **Source:** home-utilities-monorepo@feat/PP-47-fin-naming-convention

> **Altitude:** repo ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## What it is

`fin` is the **financial applet** inside Home Utilities: one bounded context for ledger,
budget, categories, currencies, and (later) debts/projection. It is **not** a separate
deployable — same BFF, same Postgres, same user — with an explicit namespace so other applets
cannot collide on `accounts` / `categories` / `transactions`.

Product ticket: PP-46. This ref is the foundation (PP-47).

## Naming split

| Layer | Convention | Example |
|---|---|---|
| Postgres table / enum | `fin_<snake>` via `@@map` / `@map` | `fin_accounts`, `fin_budgets` |
| Prisma model | `Fin` + PascalCase | `FinAccount`, `FinBudget` |
| Prisma fields | camelCase + `@map` snake_case (existing persistence gate) | `createdAt` → `created_at` |
| API feature folder | `apps/api/src/features/fin/` | Nest `FinModule` |
| API routes | under global prefix `v1`, then `fin/…` | `/v1/fin/…` |
| Web feature folder | `apps/web/src/features/fin/` | panel UI for the applet |
| Contracts ownership | financial panel types belong to the fin applet | see *Contracts* below |
| UI copy | product language, **no** `fin` prefix required | “Orçamento”, “Categorias” |

`fin` = applet/module. `budget` = **feature/panel inside** `fin` (e.g. table `fin_budgets`),
not a second top-level namespace.

## What must not get a `fin_` prefix

| Thing | Why |
|---|---|
| Auth, user, session, health, readiness | Cross-cutting / other features |
| Shared infra (`shared/infrastructure/…`) | Not domain |
| UI strings and route page titles | Product copy |
| Double prefixes (`fin_fin_…`, `fin_budget_budget_…`) | Noise; one applet prefix is enough |

## Code layout (when domain lands)

Do **not** create empty scaffold folders in this ticket. When PP-48+ implement domain:

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

`fin` is **one** Nest/web feature folder for the applet. Internal panels (budget, ledger,
categories) are subfolders/concepts inside it — not separate `features/fin-budget` apps and
not extra table prefixes.

Wiring: import `FinModule` from `AppModule` (same pattern as `HealthModule` in
`apps/api/refs/api-architecture.md`).

## Persistence

Builds on `apps/api/refs/api-persistence.md` (PascalCase models, snake_case DB, map gate).

| Rule | Detail |
|---|---|
| Every fin table/enum maps to `fin_…` | e.g. model `FinAccount` → `@@map("fin_accounts")` |
| No bare financial tables | `accounts`, `categories`, `budgets` without `fin_` are rejected by convention |
| Money always has currency | amount + currency from the fin catalog (domain tickets) |
| Ledger is source of truth | budget panels do not store a parallel unreconciled balance |

There is **no** fin Prisma model in `schema.prisma` today — domain models arrive with the
product/spec tickets under PP-46.

## HTTP

Global prefix remains `v1` (`apps/api/refs/api-http-contract.md`). Fin controllers register
paths as `fin/…` so the public surface is `/v1/fin/…`. Health stays `/v1/health` (not under
`fin`).

## Contracts

`@packages/contracts` stays types-only (`refs/monorepo-contracts.md`).

| Rule | Detail |
|---|---|
| Ownership | Budget, income, transaction/posting, debts, projection, money/currency panel types are **fin applet** contracts |
| New fin types | Prefer `Fin*` type names and/or `packages/contracts/src/fin/` when adding or breaking-changing shapes |
| Today | Existing files (`budget.ts`, `money.ts`, `income.ts`, …) **predate** this boundary and keep their current paths/names until an endpoint/contract ticket migrates them in the same PR as consumers |

Do not rename contracts in a docs-only PR.

## Hard rules (for later tickets)

- No financial Prisma model or `/v1/fin` controller without following this naming.
- No second top-level prefix for budget/ledger/categories (`budget_*` tables are wrong).
- UI may say “Orçamento”; schema and API stay `fin`.
- Specs/plans under PP-46 must cite this ref instead of inventing another prefix.

## Related refs

| Subject | Ref |
|---|---|
| API layout / features | `apps/api/refs/api-architecture.md` |
| Prisma / snake_case gate | `apps/api/refs/api-persistence.md` |
| HTTP prefix `v1` | `apps/api/refs/api-http-contract.md` |
| Shared contracts | `refs/monorepo-contracts.md` |
| Web features layout | `apps/web/refs/web-architecture.md` |
