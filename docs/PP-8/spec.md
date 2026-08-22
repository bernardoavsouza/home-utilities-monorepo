---
contract: cienty-spec-v1
ticket: PP-8
title: "[API] Contratos tipados client↔API (DTOs por painel)"
repo: home-utilities-monorepo
status: ready
owner: unknown
created_at: 2026-08-22T01:51:43Z
updated_at: 2026-08-22T01:56:00Z
base: origin/main @ 2026-08-22
parent: PP-1
follow_ups: [PP-14, PP-18, PP-20, PP-21, PP-22, PP-24, PP-26, PP-27, PP-41, PP-42, PP-43]
siblings: [PP-5]
approved_by: "spec-plan-reviewer 2026-08-22 (iter 1)"
spec_mode: standard
source_links:
  - https://bernardoavsouza.atlassian.net/browse/PP-8
  - https://bernardoavsouza.atlassian.net/browse/PP-5
---

# PP-8 — [API] Contratos tipados client↔API (DTOs por painel)

## Context

Home Utilities is a personal-finance monorepo (`apps/web` thin client + `apps/api` Nest owner of auth, rules, and panel view-models). PP-5 locks five MVP pillars: ledger, multi-currency, budget panel, debts panel, projection. Web must not invent parallel balances or loose `any` on panel payloads — it consumes typed view-models from the API.

**Baseline verified on `origin/main` @ `428848f`:**

| Fact | Anchor |
|---|---|
| Shared contracts package is types-only `@packages/contracts` | `packages/contracts/package.json`, `refs/monorepo-contracts.md` |
| Current exports: health, readiness, `ApiErrorBody` | `packages/contracts/src/{health,readiness,http,index}.ts` |
| `ApiErrorBody` = `{ statusCode, message, error? }` — **no** `code` / `fields` | `packages/contracts/src/http.ts`, `AllExceptionsFilter` |
| API response DTOs `implements` contract types (health/readiness only) | `apps/api/.../health-response.dto.ts` |
| Web depends on `@packages/contracts` but imports nothing yet | `apps/web/package.json`, `refs/monorepo-contracts.md` |
| No domain/panel endpoints or Prisma finance models yet | `apps/api/AGENTS.md` (“health is the only feature”) |

Gap: MVP panel contracts (auth session, money+currency, budget home, assign, income, txn/posting, move-money, debts, projection, dashboard) and standardized error fields are missing, so later API/UI tickets cannot share a single typed surface.

## Objective

Publish a **versioned, panel-oriented TypeScript contract surface** in `@packages/contracts` so `apps/web` and `apps/api` share the same DTOs for MVP panels, with Money always carrying currency and errors exposing `code` / `message` / `fields`, such that web typechecks MVP panel flow types without loose `any`.

Operational unit: the **shared contract types** (not domain persistence or live endpoints).

## Task classification

- Classification: `Medium`
- Rationale:
  - Cross-app breaking surface (`@packages/contracts`) consumed by every later finance ticket
  - Money + standardized errors are high-regression-risk contracts even without runtime domain yet
  - Multiple panel shapes with different request/response branches
  - No ledger persistence or endpoint behavior in this ticket (keeps it below Complex/Critical)

## Decisões alinhadas (locked with the user)

1. Extend existing `@packages/contracts` — **do not** invent a second contracts package (repo hard rule + ticket input).
2. Prefer **API** naming in new text; “BFF” in older tickets means `apps/api`.
3. Contracts are **per tela/painel** (view-model + action payloads), not generic CRUD entity mirrors (PP-8 + PP-5).
4. Money **always** includes currency (PP-5 / PP-42).
5. Keep scope to contracts + type wiring for compile acceptance — **do not** implement full budget/debts/projection domain features in this ticket.
6. Align shapes to PP-5 pillars and the named minimum list: auth session, money+currency, budget home, assign, income, txn/posting, move-money, debts panel, projection, dashboard.
7. Errors standardized with **`code`, `message`, `fields`** (extend current `ApiErrorBody` compatibly; keep Nest `statusCode` / optional `error` reason).
8. **No Nest panel DTO classes or routes in this ticket.** API wiring here is limited to extending `ApiErrorBody` + `AllExceptionsFilter` forwarding. Future feature tickets add `implements` DTOs when endpoints land (same pattern as health).
9. Web acceptance is **compile-time**: typed fixture modules under `apps/web` importing every panel contract with no `any` — not UI screens.

## Scope

In scope:
- New types under `packages/contracts/src/` for primitives (`Money`, `CurrencyCode`, month key, ids) and each MVP panel/action listed above
- Extend `ApiErrorBody` with `code` and `fields`; thread them through `AllExceptionsFilter` when present on thrown payloads
- Re-export from `packages/contracts/src/index.ts` (`.js` specifiers)
- Update `refs/monorepo-contracts.md` (+ bump `Reviewed:`) and touch `apps/api/refs/api-http-contract.md` error table for the new fields
- Web compile consumption: typed modules + vitest fixtures importing panel contracts (no `any`) so `pnpm typecheck` / `pnpm test` prove acceptance
- Contracts package typecheck + root `pnpm typecheck` / existing tests still green

Out of scope:
- Prisma models, migrations, ledger engine, FX table implementation
- Auth/session HTTP endpoints (PP-14), budget/debts/projection endpoints (PP-18+)
- OpenAPI codegen pipeline as source of truth
- UI panels (PP-29+)
- New `packages/*` workspace packages
- Changing global prefix `/v1` or inventing a parallel versioning scheme inside type names

## Business rules / invariants

- **Panel orientation:** types describe UI/API panel payloads and actions, not raw CRUD tables.
- **Money:** every monetary field is `Money = { amount: string; currency: CurrencyCode }`. No bare `number` money. `amount` is a decimal string in **major units** (e.g. `"10.50"`), never a JSON float.
- **CurrencyCode:** branded ISO 4217 uppercase string (`string & { readonly __brand: 'CurrencyCode' }`). MVP does not close the set in the type system; construct via assertion only after validation (`value as CurrencyCode`). Empty/lowercase must not be asserted. Runtime validation belongs to later API tickets.
- **Single currency coherence (assumed for budget/dashboard panels):** budget home / dashboard responses declare a panel `currency` (plus per-field Money). Debts panel is multi-currency: totals are `totalsByCurrency` (no cross-currency aggregate). Clients must not sum Money with different currencies without an explicit FX contract (FX helpers out of scope here).
- **Ids:** opaque `string` (UUID expected at runtime).
- **Budget month:** branded `BudgetMonth` (`string & { readonly __brand: 'BudgetMonth' }`) with runtime/format rule `YYYY-MM` (documented in ref). Do **not** use a fragile template-literal brand; construct via assertion after validation.
- **Auth session:** discriminated `authenticated: true | false`; when true, includes user id, email, displayName, `baseCurrency`. Include `LogoutResponse = { ok: true }` for the logout action contract.
- **Errors:** clients may rely on `message` always; machine `code?: string` (free-form in MVP; domain tickets may later introduce string-union aliases) and `fields?: Record<string, string[]>` when the API supplies them. HTTP status remains in `statusCode`.
- **Compatibility:** adding optional `code`/`fields` must not break existing health/observability tests that only assert `statusCode`/`message`.
- **Import rule:** consumers use `import type { … } from '@packages/contracts'` only (no deep paths).

## Technical contracts

### Approach (chosen)

**Shared TypeScript contracts package (extend `@packages/contracts`)** as the source of truth between web and API. Nest Swagger DTO classes continue to `implements` those types when endpoints land. Rejected alternatives:
- **OpenAPI-first codegen** — heavier toolchain; repo already standardized on types-only package + DTO `implements`.
- **Per-panel packages** — forbidden without product reason; one package already exists.

### Backend/API

Contract modules (files under `packages/contracts/src/`):

| Module | Types (minimum) |
|---|---|
| `money.ts` | `CurrencyCode`, `Money` |
| `http.ts` (extend) | `ApiErrorBody` += `code?: string`, `fields?: Record<string, string[]>` |
| `auth.ts` | `AuthSessionUser`, `AuthSessionResponse`, `LoginRequest`, `SignupRequest`, `LogoutResponse` |
| `budget.ts` | `BudgetMonth`, `BudgetCategoryLine`, `BudgetGroup`, `BudgetHomeResponse`, `AssignCategoryRequest`, `AssignCategoryResponse`, `MoveMoneyRequest`, `MoveMoneyResponse` |
| `income.ts` | `IncomeEntry`, `CreateIncomeRequest`, `UpdateIncomeRequest`, `IncomeListResponse` |
| `transaction.ts` | `BudgetTransaction`, `CreateTransactionRequest`, `UpdateTransactionRequest`, `TransactionListResponse` |
| `debts.ts` | `DebtSummary`, `DebtDetail`, `DebtsPanelResponse`, `CreateDebtRequest`, `RegisterDebtPaymentRequest`, `RegisterDebtPaymentResponse` |
| `projection.ts` | `ProjectionHorizonMonths`, `ProjectionQuery`, `ProjectionMonthPoint`, `ProjectionResponse` |
| `dashboard.ts` | `DashboardGroupBreakdown`, `DashboardResponse` |

Shape rules (exact fields locked here so implementers do not guess):

**Money**
```ts
type CurrencyCode = string & { readonly __brand: 'CurrencyCode' }; // uppercase ISO 4217, e.g. "BRL"
type Money = { amount: string; currency: CurrencyCode };
```

**ApiErrorBody** (extended)
```ts
type ApiErrorBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
  fields?: Record<string, string[]>;
};
```

**AuthSessionResponse** — `{ authenticated: true; user: AuthSessionUser } | { authenticated: false; user: null }`  
`AuthSessionUser`: `{ id; email; displayName: string | null; baseCurrency: CurrencyCode }`  
`LoginRequest`: `{ email; password }` · `SignupRequest`: `{ email; password; displayName?: string; baseCurrency: CurrencyCode }` · `LogoutResponse`: `{ ok: true }`

**BudgetHomeResponse** — one-shot panel feed: `{ month: BudgetMonth; currency: CurrencyCode; readyToAssign: Money; totals: { income: Money; assigned: Money; spent: Money; available: Money; overspentAmount: Money }; groups: BudgetGroup[] }`  
`BudgetGroup`: `{ id; name; categories: BudgetCategoryLine[] }`  
`BudgetCategoryLine`: `{ id; name; assigned: Money; spent: Money; available: Money; overspent: boolean }`

**AssignCategoryRequest**: `{ month; categoryId; amount: Money }` → **AssignCategoryResponse**: `{ category: BudgetCategoryLine; readyToAssign: Money }`

**MoveMoneyRequest**: `{ month; fromCategoryId; toCategoryId; amount: Money }` → **MoveMoneyResponse**: `{ from: BudgetCategoryLine; to: BudgetCategoryLine; readyToAssign: Money }`

**Income**: `IncomeEntry { id; month; note: string | null; amount: Money; occurredOn: string /* ISO date */ }` + create/update requests + `IncomeListResponse { month; items: IncomeEntry[]; total: Money }`

**Transactions (txn/posting view)**: `BudgetTransaction { id; month; categoryId; note: string | null; amount: Money; occurredOn: string; postingId: string }` + create/update + `DeleteTransactionResponse { id; reversedPostingId: string | null }` + list response. `postingId` makes the ledger link explicit without exposing journal internals.

**DebtsPanelResponse**: `{ totalsByCurrency: Array<{ currency: CurrencyCode; principal: Money; balance: Money }>; debts: DebtSummary[] }`  
`DebtSummary`: `{ id; name; status: 'active' | 'paid' | 'archived'; principal: Money; balance: Money }`  
`DebtDetail` extends summary with `{ notes: string | null; openedOn: string | null; dueOn: string | null }`  
`RegisterDebtPaymentRequest`: `{ amount: Money; occurredOn: string; note?: string }` → response includes updated `DebtDetail` + `postingId`

**ProjectionResponse**: `{ currency: CurrencyCode; horizonMonths: ProjectionHorizonMonths; assumptions: { includeBudgetAssigned: boolean; includeDebts: boolean; note: string }; points: ProjectionMonthPoint[] }`  
`ProjectionMonthPoint`: `{ month: BudgetMonth; income: Money; expenses: Money; debtPayments: Money; net: Money; projectedBalance: Money }`  
`ProjectionQuery`: `{ horizonMonths: ProjectionHorizonMonths; currency?: CurrencyCode }` where `ProjectionHorizonMonths = 3 | 6 | 12`

**DashboardResponse**: `{ month: BudgetMonth; currency: CurrencyCode; income: Money; assigned: Money; spent: Money; readyToAssign: Money; overspent: boolean; byGroup: { groupId; name; assigned: Money; spent: Money }[] }`

`AllExceptionsFilter` must forward `code` and `fields` when the HttpException response object includes them (string `code`, non-empty object `fields` with string[] values); omit keys when absent or when `fields` is `{}` (same style as optional `error`).

No new Nest feature modules/routes in this ticket.

### Data/model/migrations

N/A — types only; no schema changes.

### Frontend

- Add `apps/web/src/lib/api-contracts/` (or equivalent) modules that **re-export / consume** panel types for future panels (auth, budget, debts, projection, dashboard) via `import type` from `@packages/contracts`.
- Include a small typecheck-oriented test or TS file that constructs example literals for each panel response **without `any` / `as unknown`**, so `web` `typecheck` fails if contracts regress.
- No UI screens required.

### Integrations/side effects

N/A.

### Security/privacy

- Contracts may include email/displayName on session — no passwords in responses.
- `LoginRequest`/`SignupRequest` passwords exist only on request types; never on `AuthSession*`.
- No auth enforcement implemented here.

## Candidate files

- `packages/contracts/src/*.ts` — new panel modules + `index.ts` re-exports
- `packages/contracts/src/http.ts` — extend `ApiErrorBody`
- `refs/monorepo-contracts.md` — surface table update
- `apps/api/refs/api-http-contract.md` — error envelope rows for `code`/`fields`
- `apps/api/src/shared/infrastructure/http/all-exceptions.filter.ts` — forward new fields
- `apps/api/src/shared/infrastructure/http/observability.http.spec.ts` — keep green; add assertion that optional fields round-trip when provided (unit on filter if easier)
- `apps/web/src/lib/api-contracts/**` — compile consumption without `any`
- `apps/web` vitest type/smoke test importing contracts

## Acceptance criteria

- [ ] `@packages/contracts` exports typed contracts for: auth session, money+currency, budget home, assign, income, txn/posting, move-money, debts panel, projection, dashboard
- [ ] Every monetary field in those contracts uses `Money` (amount string + currency)
- [ ] `ApiErrorBody` includes `code` and `fields` (optional keys; documented); filter forwards them when present
- [ ] `apps/web` typechecks modules that consume those panel types with **no** `any` on the panel payloads
- [ ] `refs/monorepo-contracts.md` updated; `Reviewed:` bumped; error section in `api-http-contract.md` updated
- [ ] Root `pnpm typecheck` and `pnpm test` pass
- [ ] No out-of-scope behavior changed (no new domain HTTP features/Prisma models)

## Validation plan

Automated:
- `pnpm --filter @packages/contracts typecheck`
- Root `pnpm typecheck` (turbo)
- Root `pnpm test` (existing api/web suites)
- Web: vitest test (or `*.test.ts`) that imports panel types and assigns satisfies-style fixtures — fails on structural drift
- API: unit/http test that an HttpException payload with `code` + `fields` appears in JSON body; existing 404 `ApiErrorBody` test still passes

Manual/smoke:
- Not required for types-only; optional: open `packages/contracts/src/index.ts` exports list vs acceptance list

Regression checks:
- Health/readiness contracts unchanged in meaning
- Observability 404 body still matches prior required fields
- No new Nest routes under `/v1`

### Detail expected when the risk justifies it

- **Cenários principais de comportamento:**
  1. Contracts package exports all MVP panel types and typechecks
  2. Web panel contract modules typecheck without `any`
  3. Error filter forwards `code`/`fields` when provided
  4. Error filter omits `code`/`fields` when absent (backward compatible)
- **Variações de entrada:** HttpException string body vs object body vs object with partial `code`/`fields`; invalid `fields` types ignored/omitted
- **Bordas relevantes:** empty `fields` object omitted from response; `message` as string[]; Money amount `"0"`; multi-currency debts via `totalsByCurrency`
- **Transições de estado:** N/A (no domain state machine)
- **Invariantes de domínio:** no monetary field without currency; passwords never on session response types
- **Riscos cobertos por teste:** drift of export surface → contracts/web typecheck; error shape regression → filter spec
- **Compatibilidade:** additive optional error fields; existing clients reading `statusCode`/`message` keep working

## Refs afetadas / verdade viva

- `refs/monorepo-contracts.md` — expand Current surface table; note web now imports panel types; document Money + error extension
- `apps/api/refs/api-http-contract.md` — Error responses table includes `code` / `fields`

## Risks, assumptions, and open decisions

Risks:
- Over-fitting panel field lists before endpoint tickets — **mitigation:** keep fields to PP-5/PP-8 minimum; follow-ups may extend additively in the same package
- Decimal-string Money vs integer minor units — **mitigation:** lock decimal major-unit strings now; document in ref; convert at domain boundary later
- Extending `ApiErrorBody` without updating filter → false docs — **mitigation:** filter + test in same PR

Assumptions:
- PP-5 + linked API tickets are sufficient product authority for field lists (no Figma required for contracts)
- Session transport (cookie vs bearer) is orthogonal; contract is the JSON session body only
- `postingId` on transactions/debt payments is enough ledger linkage for MVP UI

Open decisions (closed in this spec unless review objects):
- Money amount representation → **decimal string major units** (chosen)
- Error `code`/`fields` optional vs required → **optional keys** for backward compatibility; domain endpoints SHOULD populate them when known
- OpenAPI codegen → **not** in this ticket
