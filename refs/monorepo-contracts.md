# Monorepo — Shared contracts

> **Status:** stable · **Reviewed:** 2026-08-30 · **Source:** home-utilities-monorepo@feat/PP-48-currency-catalog-money

> **Altitude:** repo ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## What it is

`packages/contracts`, published in the workspace as `@packages/contracts`: the **types-only**
contract between `apps/web` and `apps/api`. Private, `"type": "module"`, and consumed
**as source** — `exports["."]` maps both `types` and `default` to `./src/index.ts`, so there is
no build step. Its only script is `typecheck`.

Boilerplate surface: health / readiness / HTTP errors. Financial shared primitives from PP-48:
`Money` / `CurrencyCode` in `money.ts`. Fin **panel** payloads (budget, ledger UI, etc.) are
**not** in this package until their tickets land — then they go under
`packages/contracts/src/fin/` with `Fin*` type names (see `monorepo-fin-module.md`).

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

`packages/contracts/src/index.ts` is the only entry point and re-exports everything.

## Who consumes what

| Consumer | Uses |
|---|---|
| `apps/api` — health service, controller, response DTO | `HealthResponse` |
| `apps/api` — readiness service, controller, response DTO | `ReadinessResponse` |
| `apps/api` — global exception filter (+ specs) | `ApiErrorBody` (`code` / `fields` forwarded when valid) |
| `apps/api` — `modules/financial/domain/currency` | `Money`, `CurrencyCode`, `CurrencyDefinition` |
| `apps/web` — `src/lib/api-contracts` fixtures | `Money` via `import type` + `satisfies` (no `any`) |

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
  `apps/api/src/modules/financial/domain/currency/` — contracts stay types-only.
- **`Money.amountMinor` is a safe integer** in the currency's minor units (scale from the catalog:
  fiat 2, USDC/USDT 6, BTC 8). Never persist an amount without currency.
- **No fin panel contracts yet** (budget, income, txn, debts, projection, dashboard, auth session).
  Those return with their domain tickets as `Fin*` types under `src/fin/`.
- **`ApiErrorBody.code` / `fields` are optional.** The exception filter includes them only when
  `code` is a string and `fields` is a non-empty `Record<string, string[]>`; malformed or empty
  `{}` values are omitted.
