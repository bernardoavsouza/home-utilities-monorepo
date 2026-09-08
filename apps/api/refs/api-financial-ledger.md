# API — Financial ledger

> **Status:** stable · **Reviewed:** 2026-09-07 · **Source:** home-utilities-monorepo@feat/PP-49-ledger-accounts-balanced-entries

> **Altitude:** app ref. File/class/symbol names are **implementation anchors** (they drift);
> the rule does not depend on them.

## What it is

Double-entry ledger for the `fin` module: typed accounts, journal entries + lines (model A),
balances derived only from lines. Domain + Prisma + Nest application services under
`modules/financial`. No HTTP panel in this surface yet (PP-52+).

## Persistence

| Prisma model | Postgres table |
|---|---|
| `FinAccount` | `fin_accounts` |
| `FinJournalEntry` | `fin_journal_entries` |
| `FinJournalLine` | `fin_journal_lines` |

Enums: `fin_account_type`, `fin_journal_side`, `fin_system_account_kind`.

Line shape: `side` (`debit` \| `credit`) + `amount_minor` (`BigInt`, ≥ 0). No signed amounts on
lines. No `category_id` (PP-50). No materialised `balance` column.

## Account types and system accounts

| type | Normal signed balance |
|---|---|
| `asset`, `expense` | Σ debit − Σ credit |
| `liability`, `income`, `equity` | Σ credit − Σ debit |

User-facing “minhas contas”: `asset` / `liability` with `system_kind IS NULL`. There is no
separate `is_system` column — `system_kind` alone discriminates, so an account that is flagged
system without a kind (invisible to every read path) is not representable. `isSystem` survives on
`LedgerAccountRecord`, derived from `systemKind !== null`.

System accounts (lazy per user × currency): `income`, `expense`, `exchange` (equity),
`opening_balance` (equity). Unique `(user_id, system_kind, currency)`.

## Posting gate

All journal writes go through `LedgerService.postEntry`, which always runs
`assertEntryBalanced` (debits = credits **per currency**) before insert. High-level commands
only build lines then call `postEntry`.

Commands: `createUserAccount`, `ensureSystemAccounts`, `postExpense`, `postIncome`,
`postTransfer`, `postPayLiability`, `postSplitExpense`, `postExchange` (+ optional fee),
`postOpeningBalance`, `reverseEntry`, `getAccountBalance`, `getAccountLedger`.

`kind` is the Postgres enum `fin_entry_kind` (`expense`, `income`, `transfer`, `pay_liability`,
`exchange`, `split`, `opening_balance`, `reversal`) — like every other fin enum, PascalCase in
Prisma and snake_case in the database, mapped in the repository.

Posted entries are immutable; corrections are reversing entries (`kind = reversal`).
An entry can be reversed **once** — a second `reverseEntry` on the same entry throws
`FIN_ENTRY_IMMUTABLE`, and `reverses_entry_id` is `UNIQUE`, so the database holds the invariant
even against writes that skip the service. Reversing a reversal is allowed. Partial reversal is
deliberately out: a partial refund is a new fact and will get its own kind and link, not a second
row pointing at the same original. `postEntry` validates ownership of
`reversesEntryId` before insert, so a reversal never points at another user's entry.

Atomicity is scoped to the write: validation (ownership, currency, balance) and
`ensureSystemAccounts` run **before** the transaction; the entry + its lines are inserted in a
single atomic nested create. There is no update/delete path, so a mid-post failure leaves no
partial entry.

`postTransfer` requires two distinct accounts. `getAccountLedger` takes an optional
`{ from?, to? }` range filtered on `posted_at` — prefer it over listing an account's full history.

## Exchange

User supplies explicit `fromMoney` + `toMoney` (no market FX API). Lines hit both user accounts
and per-currency Exchange equity accounts so the entry balances in each currency. Optional fee
is expense line(s) in the from currency on the same entry. A fee is **validated whenever it is
present** (currency must match `fromMoney`, `amountMinor >= 0`); it only emits lines when
`amountMinor > 0`.

## Ownership

Every account and entry carries opaque `user_id` (UUID). No `User` FK until auth lands. Cross-user
access returns not-found domain errors.

## Anchors

| Concern | Path |
|---|---|
| Balance rules | `modules/financial/domain/ledger/balance.ts` |
| Application commands | `modules/financial/application/ledger.service.ts` |
| Prisma repository | `modules/financial/infrastructure/ledger.repository.ts` |
| Nest wiring | `modules/financial/financial.module.ts` |
| Schema | `prisma/schema.prisma` |
