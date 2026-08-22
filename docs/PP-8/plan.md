# PP-8 Contratos tipados client↔API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@packages/contracts` with MVP panel DTOs (auth, money, budget, income, txn, move-money, debts, projection, dashboard), standardize `ApiErrorBody` with `code`/`fields`, wire the API exception filter, prove web typechecks without `any`, and update living refs.

**Architecture:** Types-only shared package remains the source of truth. New modules under `packages/contracts/src/` re-exported from `index.ts`. API only forwards new error fields in `AllExceptionsFilter` (no panel Nest modules). Web gains `src/lib/api-contracts/` fixtures that `satisfies` each panel type.

**Tech Stack:** TypeScript (verbatimModuleSyntax), pnpm workspaces, NestJS filter, Vitest, Turborepo `pnpm typecheck` / `pnpm test`.

**Spec:** `docs/PP-8/spec.md` (status: ready)

## Global Constraints

- pnpm only; Node 26; no new `packages/*`
- `import type` from `@packages/contracts` entry only; re-exports use `./x.js` specifiers
- Money = `{ amount: string; currency: CurrencyCode }` everywhere monetary
- No Prisma models, no panel HTTP routes, no Nest panel DTO classes
- No comments unless non-obvious intent requires them
- Update `refs/monorepo-contracts.md` + `apps/api/refs/api-http-contract.md` in the same change
- Unstage `docs/*/*-review.md` before commit

### Export checklist (must all be reachable from package entry)

`CurrencyCode`, `Money`, `ApiErrorBody` (extended), `AuthSessionUser`, `AuthSessionResponse`, `LoginRequest`, `SignupRequest`, `LogoutResponse`, `BudgetMonth`, `BudgetCategoryLine`, `BudgetGroup`, `BudgetHomeResponse`, `AssignCategoryRequest`, `AssignCategoryResponse`, `MoveMoneyRequest`, `MoveMoneyResponse`, `IncomeEntry`, `CreateIncomeRequest`, `UpdateIncomeRequest`, `IncomeListResponse`, `BudgetTransaction`, `CreateTransactionRequest`, `UpdateTransactionRequest`, `DeleteTransactionResponse`, `TransactionListResponse`, `DebtSummary`, `DebtDetail`, `DebtsPanelResponse`, `CreateDebtRequest`, `RegisterDebtPaymentRequest`, `RegisterDebtPaymentResponse`, `ProjectionHorizonMonths`, `ProjectionQuery`, `ProjectionMonthPoint`, `ProjectionResponse`, `DashboardGroupBreakdown`, `DashboardResponse` — plus existing health/readiness exports unchanged.

---

### Task 1: Money primitive + extended ApiErrorBody

**Files:**
- Create: `packages/contracts/src/money.ts`
- Modify: `packages/contracts/src/http.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts` typecheck (no runtime test file required here)

**Interfaces:**
- Produces: `CurrencyCode`, `Money`, extended `ApiErrorBody`

- [ ] **Step 1: Write `money.ts`**

```ts
export type CurrencyCode = string;

export type Money = {
  amount: string;
  currency: CurrencyCode;
};
```

- [ ] **Step 2: Extend `http.ts`**

```ts
export type ApiErrorBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
  fields?: Record<string, string[]>;
};
```

- [ ] **Step 3: Re-export from `index.ts`**

Add: `export type { CurrencyCode, Money } from './money.js';` (keep existing http export).

- [ ] **Step 4: Typecheck contracts**

Run: `pnpm --filter @packages/contracts typecheck`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/money.ts packages/contracts/src/http.ts packages/contracts/src/index.ts
git commit -m "feat(PP-8): add Money type and extend ApiErrorBody"
```

---

### Task 2: Panel contract modules

**Files:**
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/budget.ts`
- Create: `packages/contracts/src/income.ts`
- Create: `packages/contracts/src/transaction.ts`
- Create: `packages/contracts/src/debts.ts`
- Create: `packages/contracts/src/projection.ts`
- Create: `packages/contracts/src/dashboard.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: `Money`, `CurrencyCode` from `./money.js`
- Produces: all panel types in the Global Constraints export checklist

- [ ] **Step 1: Implement each module exactly as locked in `docs/PP-8/spec.md` § Technical contracts**

`auth.ts` — session discriminated union, login/signup/logout.  
`budget.ts` — `BudgetMonth`, category/group lines, `BudgetHomeResponse`, assign + move-money request/response.  
`income.ts` — entry + create/update + list.  
`transaction.ts` — txn + create/update + delete response + list (`postingId: string`).  
`debts.ts` — summary/detail/panel + create + register payment.  
`projection.ts` — `ProjectionHorizonMonths = 3 | 6 | 12`, query/point/response with `assumptions`.  
`dashboard.ts` — month summary + `byGroup`.

Use `import type { CurrencyCode, Money } from './money.js'` where needed. No runtime code.

- [ ] **Step 2: Re-export every new type from `index.ts` with `.js` specifiers**

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @packages/contracts typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src
git commit -m "feat(PP-8): add MVP panel contract types"
```

---

### Task 3: API exception filter forwards `code` / `fields`

**Files:**
- Modify: `apps/api/src/shared/infrastructure/http/all-exceptions.filter.ts`
- Modify: `apps/api/src/shared/infrastructure/http/observability.http.spec.ts` (and/or add co-located unit spec)
- Prefer adding `all-exceptions.filter.spec.ts` if HTTP harness makes throwing custom payloads awkward

**Interfaces:**
- Consumes: extended `ApiErrorBody`
- Produces: JSON body that includes `code`/`fields` only when valid on the exception payload

- [ ] **Step 1: Write failing tests**

Cover three scenarios:
1. Existing unknown-route 404 still has `statusCode` + `message` and does not require `code`/`fields`
2. `HttpException` with object `{ statusCode, message, code: 'VALIDATION_ERROR', fields: { email: ['required'] } }` → body includes those keys
3. Object with `code: 123` or `fields: 'nope'` → those invalid keys are **omitted** (do not crash)

- [ ] **Step 2: Run tests — expect FAIL** on new assertions

Run: `pnpm --filter api exec vitest run src/shared/infrastructure/http/observability.http.spec.ts`  
(or the new filter spec path)

- [ ] **Step 3: Implement forwarding in `resolveError`**

When payload is object:
- if `typeof payload.code === 'string'` → include `code`
- if `payload.fields` is a non-null object whose values are all `string[]` → include `fields`
- otherwise omit

Preserve existing `statusCode` / `message` / `error` behavior.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/infrastructure/http
git commit -m "feat(PP-8): forward ApiErrorBody code and fields"
```

---

### Task 4: Web compile fixtures without `any`

**Files:**
- Create: `apps/web/src/lib/api-contracts/panels.ts`
- Create: `apps/web/src/lib/api-contracts/panels.test.ts`

**Interfaces:**
- Consumes: all panel types from `@packages/contracts`
- Produces: exported example literals using `satisfies` (no `any`, no `as unknown as`)

- [ ] **Step 1: Write `panels.ts` with one fixture per panel/action group**

Example pattern:

```ts
import type {
  AuthSessionResponse,
  BudgetHomeResponse,
  Money,
  /* …all checklist types needed… */
} from '@packages/contracts';

export const exampleMoney = {
  amount: '10.50',
  currency: 'BRL',
} satisfies Money;

export const exampleAuthSession = {
  authenticated: true,
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'dev@example.com',
    displayName: 'Dev',
    baseCurrency: 'BRL',
  },
} satisfies AuthSessionResponse;

// …BudgetHomeResponse, Assign*, Income*, Transaction*, MoveMoney*, Debts*, Projection*, Dashboard*
```

Every monetary field must use `Money`. Include unauthenticated session variant in the test file or as second export.

- [ ] **Step 2: Write `panels.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  exampleAuthSession,
  exampleMoney,
  /* other exports */
} from './panels';

describe('api-contracts panel fixtures', () => {
  it('exposes money with currency', () => {
    expect(exampleMoney.currency).toBe('BRL');
  });

  it('exposes authenticated session user', () => {
    expect(exampleAuthSession.authenticated).toBe(true);
  });
});
```

Runtime asserts are shallow; the real gate is `tsc` + `satisfies`.

- [ ] **Step 3: Run web typecheck and test**

Run: `pnpm --filter web typecheck`  
Run: `pnpm --filter web test`  
Expected: PASS; ensure no `any` in the new files (`grep`/`eslint` if configured)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-contracts
git commit -m "feat(PP-8): consume panel contracts in web fixtures"
```

---

### Task 5: Living refs + full verification

**Files:**
- Modify: `refs/monorepo-contracts.md`
- Modify: `apps/api/refs/api-http-contract.md`

- [ ] **Step 1: Update `refs/monorepo-contracts.md`**

- Bump `Reviewed:` to `2026-08-22`
- Expand **Current surface** table with Money + each new module (group rows by file; do not paste every field)
- Update **Who consumes what**: web now imports panel fixtures; API filter uses extended `ApiErrorBody`
- Note: panel Nest DTOs arrive with endpoint tickets; contracts are the source of truth

- [ ] **Step 2: Update `apps/api/refs/api-http-contract.md` Error responses**

Document optional `code` (string) and `fields` (`Record<string, string[]>`); filter omits invalid shapes; bump `Reviewed:`

- [ ] **Step 3: Full suite**

Confirm env is local (no production `DATABASE_URL`).  
Run: `pnpm typecheck`  
Run: `pnpm test`  
Expected: PASS

- [ ] **Step 4: Final commit (include spec/plan; exclude reviews)**

```bash
git add -A
git reset -q -- 'docs/*/*-review.md'
git commit -m "feat(PP-8): document panel contracts and error envelope"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| Money + currency | 1 |
| ApiErrorBody code/fields + filter | 1, 3 |
| Auth session (+ logout) | 2, 4 |
| Budget home, assign, move-money | 2, 4 |
| Income, txn/posting (+ delete) | 2, 4 |
| Debts panel, projection, dashboard | 2, 4 |
| Web without `any` | 4 |
| Refs updated | 5 |
| typecheck + test | 1–5 |

## Execution note

This harness run executes the plan **inline** in the worktree (nested subagents unavailable). Follow TDD on Task 3; Tasks 1–2 are types-first with typecheck as the gate.
