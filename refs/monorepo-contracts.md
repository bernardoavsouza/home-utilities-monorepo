# Monorepo — Shared contracts

> **Status:** stable · **Reviewed:** 2026-08-30 · **Source:** home-utilities-monorepo@feat/PP-48-currency-catalog-money

> **Altitude:** repo ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## What it is

`packages/contracts`, published in the workspace as `@packages/contracts`: the **types-only**
contract between `apps/web` and `apps/api`. Private, `"type": "module"`, and consumed
**as source** — `exports["."]` maps both `types` and `default` to `./src/index.ts`, so there is
no build step. Its only script is `typecheck`.

Panel and action payloads for the MVP live here (per tela/painel), not as generic CRUD mirrors.
Nest response DTOs `implements` these types when endpoints land; until then the package is the
source of truth and web proves consumption via typed fixtures.

Financial panel types (budget, income, transaction, projection, dashboard) are owned
by the **fin module** — see `monorepo-fin-module.md`. `Money` / `CurrencyCode` stay shared in
`money.ts`. Debts panel contracts are **not** in this package until a dedicated debts ticket.
Existing panel files (`budget.ts`, `dashboard.ts`, …) predate that boundary; migrate each into
`packages/contracts/src/fin/` and rename exported types to `Fin*` in the same PR that creates
the Nest endpoint for that panel. The package entry point re-exports flat, so the `Fin` type
prefix is the collision boundary (not the folder alone).

## Current surface

| Type | File | Shape |
|---|---|---|
| `HealthStatus` | `packages/contracts/src/health.ts` | `'ok'` |
| `HealthResponse` | `packages/contracts/src/health.ts` | `{ status: HealthStatus }` |
| `ApiErrorBody` | `packages/contracts/src/http.ts` | `{ statusCode; message; error?; code?; fields? }` |
| `ReadinessStatus` | `packages/contracts/src/readiness.ts` | `'ready' \| 'not_ready'` |
| `DependencyStatus` | `packages/contracts/src/readiness.ts` | `'up' \| 'down'` |
| `ReadinessResponse` | `packages/contracts/src/readiness.ts` | `{ status; dependencies: { database } }` |
| `CurrencyCode`, `CurrencyKind`, `CurrencyDefinition`, `Money` | `packages/contracts/src/money.ts` | Closed MVP union `CurrencyCode` (`BRL`\|`USD`\|`EUR`\|`USDC`\|`USDT`\|`BTC`); `Money = { amountMinor: number; currency: CurrencyCode }` (safe integer minor units; scale from catalog) |
| Auth session / login / signup / logout | `packages/contracts/src/auth.ts` | Discriminated `AuthSessionResponse`; request/response action types |
| Budget home / assign / move-money | `packages/contracts/src/budget.ts` | Panel view-model + assign/move-money; branded `BudgetMonth` (`YYYY-MM`); boolean `overspent` on lines; monetary `overspentAmount` on totals |
| Income | `packages/contracts/src/income.ts` | Entry + create/update + list |
| Txn / posting view | `packages/contracts/src/transaction.ts` | Transaction with `postingId` + create/update/delete/list |
| Projection | `packages/contracts/src/projection.ts` | Horizon query + series; `horizonMonths` is `ProjectionHorizonMonths` (`3\|6\|12`) on query and response |
| Dashboard | `packages/contracts/src/dashboard.ts` | Month summary + boolean `overspent` + `byGroup` breakdown |

`packages/contracts/src/index.ts` is the only entry point and re-exports everything.

## Who consumes what

| Consumer | Uses |
|---|---|
| `apps/api` — health service, controller, response DTO | `HealthResponse` |
| `apps/api` — readiness service, controller, response DTO | `ReadinessResponse` |
| `apps/api` — global exception filter (+ specs) | `ApiErrorBody` (`code` / `fields` forwarded when valid) |
| `apps/web` — `src/lib/api-contracts` fixtures | Panel contracts via `import type` + `satisfies` (no `any`) |

Panel Nest DTOs are **not** wired yet — they arrive with the endpoint tickets and must
`implements` the matching contract type.

## Rules

- **Types only.** No runtime code, no dependencies, unless a runtime helper is explicitly agreed.
- Consumers import with `import type { … } from '@packages/contracts'` — never a deep path into
  `src/`, always the package entry point.
- Adding a type: new file under `packages/contracts/src/`, then re-export from `packages/contracts/src/index.ts` using an
  **`.js` specifier** (`export type { X } from './x.js'`) even though the source is `.ts` —
  required by `verbatimModuleSyntax` + `moduleResolution: bundler`. Copy the existing pattern.
- Changing an existing shape is a **cross-app breaking change**: update `apps/api` and
  `apps/web` in the same PR, and confirm with root `pnpm typecheck`.
- The API must keep its Swagger DTO in step with the contract type — the DTO
  `implements` the contract type so a drift fails typecheck (see
  `apps/api/refs/api-http-contract.md`).
- **Money always carries currency.** No bare numeric money fields in contracts.
- **`CurrencyCode` is a closed MVP union** (`BRL` \| `USD` \| `EUR` \| `USDC` \| `USDT` \| `BTC`).
  Runtime catalog metadata (`scale` / `symbol` / `kind`) and Money helpers live in
  `apps/api/src/features/fin/domain/currency/` — contracts stay types-only.
- **`Money.amountMinor` is a safe integer** in the currency's minor units (scale from the catalog:
  fiat 2, USDC/USDT 6, BTC 8). Never persist an amount without currency.
- **`BudgetMonth` is branded `YYYY-MM`.** Same construction rule (`value as BudgetMonth`); not a
  template-literal brand. Runtime format checks belong to later API tickets.
- **`overspent` vs `overspentAmount`.** Boolean flags stay named `overspent` (category line,
  dashboard). The budget-home monetary total is `overspentAmount: Money`.
- **No debts panel contracts yet.** Dívidas ficam fora de `@packages/contracts` até o ticket
  próprio (PP-46 colocou painel de dívidas fora do epic `fin` MVP).
- **`ApiErrorBody.code` / `fields` are optional.** The exception filter includes them only when
  `code` is a string and `fields` is a non-empty `Record<string, string[]>`; malformed or empty
  `{}` values are omitted.
