# Monorepo — Financial module (naming & boundary)

> **Status:** stable · **Reviewed:** 2026-09-07 · **Source:** home-utilities-monorepo@feat/PP-49-ledger-accounts-balanced-entries

> **Altitude:** repo ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## What it is

`financial` is the **product module** (bounded context) for ledger, budget, categories,
currencies, debts, and projection inside Home Utilities. It is **not** a separate deployable —
same BFF, same Postgres, same user — with an explicit namespace so other modules cannot collide
on `accounts` / `categories` / `transactions`.

**Folder name** is long (`financial`). **Wire names** stay short: `fin_*` tables, `/v1/fin/…`
routes, `Fin*` Prisma/contract type prefixes.

## Naming split

| Layer | Convention | Example |
|---|---|---|
| Postgres table / enum | `fin_<snake>` via `@@map` / `@map` | `fin_accounts`, `fin_budgets` |
| Prisma model | `Fin` + PascalCase | `FinAccount`, `FinBudget` |
| API module folder | `apps/api/src/modules/financial/` | Nest `FinancialModule` (when wired) |
| API routes | under global prefix `v1`, then `fin/…` | `/v1/fin/…` |
| Web feature folder | `apps/web/src/features/financial/` | panel UI for the module |
| Contracts ownership | `packages/contracts/src/fin/` + `Fin*` type names | `FinBudgetHomeResponse` (barrel is flat — folder alone is not a namespace) |
| UI copy | product language, **no** `fin` / `financial` prefix required | “Orçamento”, “Categorias” |

`financial` = module. `budget` = **feature/panel inside** the module (e.g. table `fin_budgets`),
not a second top-level module.

## What must not get a `fin_` prefix

| Thing | Why |
|---|---|
| Auth, user, session, health, readiness | Cross-cutting / other features under `src/features/` |
| Shared infra (`src/shared/infrastructure/…`) | Not domain — geral |
| Shared money primitives (`Money`, `CurrencyCode`) | Cross-module; stay at `packages/contracts/src/money.ts` |
| UI strings and route page titles | Product copy |
| Double prefixes (`fin_fin_…`, `fin_budget_budget_…`) | Noise; one wire prefix is enough |

## Code layout (API)

Canonical layout — create folders **only** when they hold real code (no empty scaffolds):

```text
apps/api/src/
  features/health/                 # geral (boilerplate)
  modules/financial/
    financial.module.ts            # Nest wiring (LedgerService + repository)
    application/                   # ledger posting commands (PP-49)
    presentation/                  # controllers under /v1/fin/… (HTTP later)
    domain/
      currency/                    # MVP catalog + Money helpers (PP-48)
      ledger/                      # balance invariants (PP-49)
    infrastructure/                # Prisma ledger repository (PP-49)
  shared/                          # geral kernel
```

Encapsulation: other modules/features do not import `modules/financial/**` internals. Share via
`@packages/contracts` or Nest exports from `FinancialModule`.

Wiring: `FinancialModule` is imported from `AppModule`. Ledger HTTP controllers are not present
yet (PP-52+); application services are the programmatic surface.

**Today:** currency catalog/helpers + ledger domain/application/infrastructure live under
`modules/financial/`. Prisma models: `fin_accounts`, `fin_journal_entries`, `fin_journal_lines`.
No `/v1/fin` HTTP controller yet.

## Code layout (Web)

```text
apps/web/src/features/financial/
  …                        # budget month UI and related panels
```

Web keeps `features/` (App Router already owns `app/`). Do not put financial UI under a
top-level `features/budget/` that bypasses the module.

## Persistence

Builds on `apps/api/refs/api-persistence.md` (PascalCase models, snake_case DB, map gate).

| Rule | Detail |
|---|---|
| Every fin table/enum maps to `fin_…` | e.g. model `FinAccount` → `@@map("fin_accounts")` (plural tables) |
| No bare financial tables | `accounts`, `categories`, `budgets` without `fin_` are wrong |
| Money always has currency | `amountMinor` + `currency`; codes come from the shared closed `CurrencyCode` MVP union |
| 1 account = 1 currency | Each fin account has exactly one currency; a posting must have `money.currency === account.currency`. Cross-currency uses Exchange equity system accounts with explicit from/to amounts — never automatic FX |
| Balances are derived | no parallel balance column; signed balance from journal lines by account type |

The snake_case map gate accepts `Fin*` model `@@map` values that are either
`toSnakeCase(ModelName)` or its English plural (so `FinAccount` → `fin_accounts` is valid)
and must keep the `fin_` prefix. Ledger behavior: `apps/api/refs/api-financial-ledger.md`.

## HTTP

Global prefix remains `v1` (`apps/api/refs/api-http-contract.md`). Financial controllers
register paths as `fin/…` so the public surface is `/v1/fin/…`. Health stays `/v1/health`
(not under `fin`).

`FinDomainError` (domain) does **not** yet map into the HTTP envelope. `AllExceptionsFilter`
only forwards `code` / `fields` from `HttpException` payloads — an escaped domain error
would surface as a generic 500 today. The domain→HTTP bridge (status + envelope) lands with
the first `/v1/fin` endpoints in **PP-52**. In that same ticket, move `FinErrorCode` into
`@packages/contracts` so the web can discriminate envelope `code` without duplicating
literals (`ApiErrorBody.code` stays `string` until then).

## Contracts

`@packages/contracts` stays types-only (`refs/monorepo-contracts.md`).

| Rule | Detail |
|---|---|
| Ownership | Fin panel types (budget, ledger UI, categories, …) are **financial module** contracts — none shipped yet beyond shared Money |
| Shared (not module-owned) | `Money` and `CurrencyCode` stay in `packages/contracts/src/money.ts` — shared primitives any module may use |
| New fin types | Put them under `packages/contracts/src/fin/` **and** prefix type names with `Fin` (`FinCategory`, `FinBudgetHomeResponse`). The package entry point re-exports flat (`import type { … } from '@packages/contracts'`), so the folder alone is not a consumer-facing namespace — the `Fin` prefix is the collision boundary |
| When to add | Introduce each `Fin*` contract in the **same PR** that creates the Nest endpoint / panel for that feature — do not pre-land unused panel DTOs |

Do not rename contracts in a docs-only PR.

## Hard rules

- No financial Prisma model or `/v1/fin` controller without following this naming.
- No second top-level module for budget/ledger/categories (`modules/budget`, `budget_*` tables are wrong).
- UI may say “Orçamento”; schema and API wire stay `fin`.
- Specs and plans for the financial domain cite this ref instead of inventing another prefix.

## Related refs

| Subject | Ref |
|---|---|
| API layout / features vs modules | `apps/api/refs/api-architecture.md` |
| Prisma / snake_case gate | `apps/api/refs/api-persistence.md` |
| HTTP prefix `v1` | `apps/api/refs/api-http-contract.md` |
| Shared contracts | `refs/monorepo-contracts.md` |
| Web features layout | `apps/web/refs/web-architecture.md` |
