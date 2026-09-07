# PP-49 Ledger — Accounts, Balanced Entries, Derived Balances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `fin_*` double-entry ledger (typed accounts + journal entries/lines model A) with per-currency balancing, derived balances, system accounts, and domain posting commands — without HTTP UI.

**Architecture:** Prisma models under `fin_*`; pure domain balance rules; a single internal `postEntry` path that **always** runs `assertEntryBalanced` before insert; Nest application service + Prisma repository under `apps/api/src/modules/financial/`; Vitest unit + `app_test` integration covering the 11 ready-spec scenarios.

**Tech Stack:** TypeScript, NestJS, Prisma 6 + PostgreSQL, Vitest, `@packages/contracts` Money/CurrencyCode, pnpm workspaces.

**Spec:** `docs/PP-49/spec.md` (status: ready)

## Task classification

- Classification: `Critical`
- Rationale: first double-entry ledger persistence; money invariants; multi-command posting branches; silent balance corruption risk for all fin follow-ups.

## Test sufficiency (Critical minimum — do not dilute)

Coverage of **all 11 ready-spec scenarios** + rejection matrix + explicit risk→test mapping below is the **minimum accepted** for Critical. Do **not** replace with vague “unit + integration” during execution.

| # | Scenario | Layer |
|---|---|---|
| 1 | create asset/liability; reject income/expense/equity user create | integration |
| 2 | postExpense from asset — balances + asset signedBalance ↓ | integration |
| 3 | credit-card purchase + payLiability → liability signedBalance 0 | integration |
| 4 | postIncome | integration |
| 5 | postTransfer same-currency | integration |
| 6 | postSplitExpense N expense debits + 1 funding — **balance only** (not category aggregation; PP-50) | integration |
| 7 | postExchange BRL→USD balanced per currency via Exchange equity | integration |
| 8 | postExchange + fee BRL — expense lines + still balanced | integration |
| 9 | postOpeningBalance asset + liability | integration |
| 10 | reverseEntry restores balances | integration |
| 11 | reject unbalanced **via `postEntry`**, <2 lines, amountMinor < 0, unknown currency, cross-user | unit + integration |

Risk → test:
- unbalanced insert accepted → `postEntry` integration with deliberately unbalanced lines must throw `FIN_ENTRY_UNBALANCED` (scenario 11)
- card math wrong → scenario 3
- exchange balances only one currency → 7/8
- parallel balance field drift → schema has no balance column; `getAccountBalance` reads lines only
- Int32 overflow → BigInt column + safe-integer conversion tests

## Global Constraints

- Work only inside the worktree; base `origin/main`.
- pnpm only; Node 24; no new `packages/*`.
- Paths under `apps/api/src/modules/financial/` (not `features/fin`).
- No HTTP controllers this ticket.
- No `categoryId`; no planned postings; no FX API.
- Line: `side` + `amountMinor ≥ 0`; balance **per currency**.
- Exchange accounts: `type=Equity`, `systemKind=Exchange`, `isSystem=true`.
- System accounts: lazy ensure per user×currency.
- Posted entries immutable; void = reversing entry.
- `amountMinor`: Postgres `BigInt`; domain `number` safe-integer.
- Comments: Clean Code — none unless non-obvious why.
- Update living refs in the same PR; bump `Reviewed:`.
- Never run against production DB.
- Single shared post path: **`LedgerService.postEntry`** (repository insert only through it) **must** call `assertEntryBalanced` before any insert — high-level commands only build lines then call `postEntry`.

## File structure

| File | Role |
|---|---|
| `apps/api/prisma/schema.prisma` | FinAccount / FinJournalEntry / FinJournalLine + enums |
| `apps/api/prisma/migrations/<ts>_fin_ledger/` | Migration SQL |
| `apps/api/src/modules/financial/domain/ledger/ledger-errors.ts` | Extra `FIN_*` codes on `FinDomainError` |
| `apps/api/src/modules/financial/domain/ledger/balance.ts` | `assertEntryBalanced`, `computeSignedBalance` |
| `apps/api/src/modules/financial/domain/ledger/types.ts` | Line draft types, entry kinds |
| `apps/api/src/modules/financial/domain/ledger/*.spec.ts` | Unit balance/errors |
| `apps/api/src/modules/financial/application/ledger.service.ts` | Commands + `postEntry` |
| `apps/api/src/modules/financial/infrastructure/ledger.repository.ts` | Prisma persistence |
| `apps/api/src/modules/financial/financial.module.ts` | Nest module |
| `apps/api/src/app.module.ts` | Import FinancialModule |
| `apps/api/src/modules/financial/application/ledger.service.spec.ts` | Integration scenarios 1–11 |
| `apps/api/refs/api-financial-ledger.md` | New ledger ref |
| `apps/api/AGENTS.md` + persistence/architecture/testing/fin refs | Living truth |

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_fin_ledger/migration.sql`
- Test: `pnpm --filter api test -- src/shared/infrastructure/prisma/prisma-snake-case-maps.spec.ts`

**Interfaces:**
- Produces: Prisma models/enums exactly as in ready spec § Data/Prisma

- [ ] **Step 1: Write schema models/enums** into `schema.prisma` exactly per spec (FinAccountType, FinJournalSide, FinSystemAccountKind, FinAccount, FinJournalEntry, FinJournalLine). Use `@db.Uuid`, `amountMinor BigInt @map("amount_minor")`, maps for all camelCase, `@@map("fin_…")`.

- [ ] **Step 2: Create migration**

Run from `apps/api` (with Docker `app` DB up / `.env` pointing local):
```bash
pnpm --filter api prisma:migrate:dev -- --name fin_ledger
```
If interactive name already passed, accept generated SQL. Also apply to test DB:
```bash
pnpm --filter api db:migrate:test
```
Then `pnpm --filter api prisma:generate`.

- [ ] **Step 3: Snake_case gate**

Run: `pnpm --filter api test -- src/shared/infrastructure/prisma/prisma-snake-case-maps.spec.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "$(cat <<'EOF'
feat(PP-49): add fin ledger Prisma models and migration

EOF
)"
```

---

### Task 2: Domain — errors + balance helpers

**Files:**
- Create: `apps/api/src/modules/financial/domain/ledger/ledger-errors.ts`
- Create: `apps/api/src/modules/financial/domain/ledger/types.ts`
- Create: `apps/api/src/modules/financial/domain/ledger/balance.ts`
- Create: `apps/api/src/modules/financial/domain/ledger/balance.spec.ts`
- Modify: `apps/api/src/modules/financial/domain/currency/money-errors.ts` — export shared `FinDomainError` / extend `FinErrorCode` **or** keep ledger codes in `ledger-errors.ts` constructing the same class (prefer extending the union in one place to avoid drift)

**Interfaces:**
- Produces:
  - `assertEntryBalanced(lines: ReadonlyArray<{ side: 'debit' | 'credit'; amountMinor: number; currency: CurrencyCode }>): void`
  - `computeSignedBalance(type: FinAccountTypeLike, debitTotal: number, creditTotal: number): number`
  - Error factories: `entryUnbalancedError`, `entryTooFewLinesError`, `lineAmountInvalidError`, `accountNotFoundError`, `accountTypeInvalidError`, `accountCurrencyMismatchError`, `exchangeInvalidError`, `entryImmutableError`

- [ ] **Step 1: Write failing unit tests** in `balance.spec.ts` covering:
  - same-currency balanced debit/credit
  - multi-currency independently balanced
  - unbalanced one currency throws `FIN_ENTRY_UNBALANCED`
  - `computeSignedBalance` for asset/expense vs liability/income/equity
  - reject negative amountMinor via helper used by post path (`assertLineAmounts`)

- [ ] **Step 2: Run — expect FAIL**

`pnpm --filter api test -- src/modules/financial/domain/ledger/balance.spec.ts`

- [ ] **Step 3: Implement** `types.ts`, `ledger-errors.ts`, `balance.ts`

`assertEntryBalanced` algorithm:
1. if lines.length < 2 → `FIN_ENTRY_TOO_FEW_LINES`
2. each line: amountMinor must be safe integer ≥ 0 else `FIN_LINE_AMOUNT_INVALID`; currency via `assertCurrency`
3. group totals debit/credit per currency; any mismatch → `FIN_ENTRY_UNBALANCED`

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/financial/domain
git commit -m "$(cat <<'EOF'
feat(PP-49): add ledger balance invariants and domain errors

EOF
)"
```

---

### Task 3: Repository + Nest module skeleton

**Files:**
- Create: `apps/api/src/modules/financial/infrastructure/ledger.repository.ts`
- Create: `apps/api/src/modules/financial/financial.module.ts`
- Modify: `apps/api/src/app.module.ts` — `imports: [FinancialModule]`

**Interfaces:**
- Produces repository methods (signatures):
  - `createAccount(data)` / `findAccountForUser(userId, accountId)` / `listUserFacingAccounts(userId)`
  - `findSystemAccount(userId, systemKind, currency)` / `createSystemAccount(...)`
  - `insertEntryWithLines({ entry, lines })` inside interactive transaction
  - `sumLinesForAccount(accountId): { debit: bigint; credit: bigint }`
  - `listLinesForAccount(accountId, …)`
  - Convert `bigint` ↔ `number` with safe-integer checks (`FIN_LINE_AMOUNT_INVALID` / money overflow)

- [ ] **Step 1: Implement repository + module** (no HTTP). Export `LedgerRepository` from `FinancialModule`. Import `PrismaModule`.

- [ ] **Step 2: Typecheck**

`pnpm --filter api typecheck` — Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/financial apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(PP-49): wire FinancialModule and ledger Prisma repository

EOF
)"
```

---

### Task 4: Application service — accounts, ensure system, `postEntry`

**Files:**
- Create: `apps/api/src/modules/financial/application/ledger.service.ts`
- Create: `apps/api/src/modules/financial/application/ledger.service.spec.ts`
- Modify: `financial.module.ts` — provide `LedgerService`

**Interfaces:**
- Produces:
  - `createUserAccount({ userId, name, type: 'asset'|'liability', currency })`
  - `listUserAccounts(userId)`
  - `ensureSystemAccounts(userId, currency)` — idempotent create of income/expense/exchange/opening_balance named `Income BRL` etc.
  - **`postEntry({ userId, kind, description?, postedAt?, reversesEntryId?, lines: { accountId, side, amountMinor }[] })`** — loads accounts, derives currency per line from account, validates ownership, calls `assertEntryBalanced`, inserts atomically. **Only write path for journal rows.**

- [ ] **Step 1: Failing integration tests** for scenarios 1 and 11 (unbalanced `postEntry`, <2 lines, negative amount, cross-user, unknown currency on create). Also: empty `postSplitExpense` splits rejected; `postTransfer` cross-currency rejected; second `ensureSystemAccounts` idempotent (no duplicate rows; P2002 treated as ensured if racing).

Boot pattern: testing module with `FinancialModule` + real `PrismaService` (needs `app_test` + migrate). Use unique `userId` UUIDs per test. `resetTestDatabase` already runs per file via vitest.setup.

- [ ] **Step 2: Run — expect FAIL**

`pnpm --filter api test -- src/modules/financial/application/ledger.service.spec.ts`

- [ ] **Step 3: Implement** create/list/ensure/`postEntry`

- [ ] **Step 4: Run — expect those cases PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/financial
git commit -m "$(cat <<'EOF'
feat(PP-49): add ledger postEntry gate and user/system accounts

EOF
)"
```

---

### Task 5: Posting commands — expense, income, transfer, payLiability, split

**Files:**
- Modify: `ledger.service.ts` / `ledger.service.spec.ts`

**Interfaces:**
- Each command builds lines then **only** calls `postEntry` (never inserts directly).
- `postExpense`, `postIncome`, `postTransfer`, `postPayLiability`, `postSplitExpense` per ready spec table.
- Split AC validates **balancing**, not per-category aggregation (PP-50).

- [ ] **Step 1: Add failing tests** scenarios 2–6 (including card purchase + payLiability → liability 0).

- [ ] **Step 2: Implement commands**

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/financial/application
git commit -m "$(cat <<'EOF'
feat(PP-49): add same-currency ledger posting commands

EOF
)"
```

---

### Task 6: Exchange (+ fee), opening balance, reverse, balances

**Files:**
- Modify: `ledger.service.ts` / `ledger.service.spec.ts`

**Interfaces:**
- `postExchange(PostExchangeInput)` lines exactly as spec
- `postOpeningBalance`
- `reverseEntry`
- `getAccountBalance` / `getAccountLedger` derived from lines via `computeSignedBalance`

- [ ] **Step 1: Failing tests** scenarios 7–10 + fee rejection (wrong fee currency) + exchange same-currency reject

- [ ] **Step 2: Implement**

- [ ] **Step 3: Full ledger.service.spec PASS (scenarios 1–11)**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/financial
git commit -m "$(cat <<'EOF'
feat(PP-49): add exchange, opening balance, reverse, derived balances

EOF
)"
```

---

### Task 7: Living refs

**Files:**
- Create: `apps/api/refs/api-financial-ledger.md`
- Modify: `apps/api/AGENTS.md` (routing row)
- Modify: `refs/monorepo-fin-module.md`
- Modify: `apps/api/refs/api-persistence.md`
- Modify: `apps/api/refs/api-architecture.md`
- Modify: `apps/api/refs/api-testing.md`
- Bump `Reviewed:` on every touched ref to today

- [ ] **Step 1: Write ledger ref** — tables for account types, system kinds, balance-per-currency, postEntry gate, command list, no categoryId/planned, BigInt note. Status stable after verifying against code.

- [ ] **Step 2: Update other refs** — remove “no fin Prisma model” / “FinancialModule not wired”; point path to `modules/financial`; document ledger specs need DB.

- [ ] **Step 3: Commit**

```bash
git add refs apps/api/refs apps/api/AGENTS.md
git commit -m "$(cat <<'EOF'
docs(refs): document fin ledger domain (PP-49)

EOF
)"
```

---

### Task 8: Final verification

- [ ] **Step 1:** `pnpm --filter api db:migrate:test && pnpm --filter api prisma:generate`
- [ ] **Step 2:** `pnpm typecheck` (root) — PASS
- [ ] **Step 3:** `pnpm test` (root) or at least `pnpm --filter api test` — PASS
- [ ] **Step 4:** Confirm schema has **no** `categoryId`, **no** account `balance` column; `fin_journal_entries` + `fin_journal_lines` present.

---

## Self-review vs spec

| Spec requirement | Task |
|---|---|
| Prisma shapes + enums | 1 |
| assertEntryBalanced / signed balance | 2 |
| Shared `postEntry` gate (review ressalva) | 4 |
| User + system accounts lazy | 4 |
| Commands expense/income/transfer/pay/split | 5 |
| Exchange+fee, opening, reverse, derived balances | 6 |
| Refs viva | 7 |
| AC scenarios 1–11 + Critical sufficiency | 4–6, sufficiency table |
| No HTTP / no categoryId / no FX | Global constraints |
