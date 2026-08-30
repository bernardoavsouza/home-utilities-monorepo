# PP-48 Currency Catalog + Typed Money Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP currency catalog and typed `Money` (`amountMinor` + closed `CurrencyCode`) with domain helpers and exact validation errors, without HTTP.

**Architecture:** Break the PP-8 major-units `Money` contract in `@packages/contracts`, put the runtime catalog + arithmetic in `apps/api/src/features/fin/domain/currency/`, update web fixtures, and refresh the two living refs. No Nest controller or Prisma in this ticket.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest (`pnpm --filter api test` / `pnpm --filter web test`), NestJS domain folder only (pure functions), `@packages/contracts` types.

**Spec:** `docs/PP-48/spec.md` (status: ready)

## Task classification

- Classification: `Complex`
- Rationale: canonical Money/scale semantics; breaking cross-app contract change (`amount` → `amountMinor`, closed `CurrencyCode`); multiple domain failure branches (unknown currency, invalid major, mismatch, overflow); silent fixture regression risk if consumers lag.

## Test sufficiency

Unit tests name concrete behaviors (catalog scales/kinds, unknown currency error shape, createMoney invalid/safe bounds, parse pad/reject/round-trip per scale, add/sub mismatch + overflow/underflow) and map 1:1 to the ready-spec scenarios. Root `pnpm typecheck` plus web fixture tests catch cross-app Money drift. HTTP/E2E/Prisma are out of scope (no endpoint, no UI route, no persistence this ticket) — they would not exercise the domain helpers beyond what Vitest already covers. The PP-49 invariant “1 account = 1 currency” is documented in refs only (no accounts yet).

## Global Constraints

- Work only inside the worktree; base is `origin/main`.
- pnpm only; Node 24; no new `packages/*`.
- Money/CurrencyCode stay in `packages/contracts/src/money.ts` (PP-47) — not under `fin/`.
- Domain helpers live under `apps/api/src/features/fin/domain/currency/` — no empty `FinModule` / no HTTP (PP-52).
- Error codes exact: `FIN_CURRENCY_UNKNOWN`, `FIN_MONEY_AMOUNT_INVALID`, `FIN_MONEY_MAJOR_INVALID`, `FIN_MONEY_CURRENCY_MISMATCH` with the `fields` shapes in the spec.
- `parseMajorToMoney`: pad fewer fractional digits; reject more digits / invalid / whitespace; no trim; no round/truncate.
- add/sub same currency only; overflow → `FIN_MONEY_AMOUNT_INVALID`.
- Comments: Clean Code — none unless non-obvious why.
- Update `refs/monorepo-contracts.md` and `refs/monorepo-fin-module.md` in the same PR; bump `Reviewed:`.
- Test via package scripts only; never prod DBs.

## File structure

| File | Role |
|---|---|
| `packages/contracts/src/money.ts` | Closed `CurrencyCode`, `CurrencyKind`, `CurrencyDefinition`, `Money` |
| `packages/contracts/src/debts.ts` | `DebtsPanelCurrencyTotals` principal/balance → `number` (amountMinor) |
| `packages/contracts/src/index.ts` | Re-export new types |
| `apps/api/src/features/fin/domain/currency/money-errors.ts` | `FinDomainError` + factories |
| `apps/api/src/features/fin/domain/currency/currency-catalog.ts` | Catalog constant + `getCurrency` / `isCurrencyCode` |
| `apps/api/src/features/fin/domain/currency/money.ts` | Money helpers |
| `apps/api/src/features/fin/domain/currency/*.spec.ts` | Vitest coverage |
| `apps/web/src/lib/api-contracts/panels.ts` + `panels.test.ts` | Fixtures on new Money shape |
| `refs/monorepo-contracts.md` | Living truth for Money/CurrencyCode |
| `refs/monorepo-fin-module.md` | Domain path + 1 conta = 1 moeda |

---

### Task 1: Contracts — Money + CurrencyCode + Debts totals

**Files:**
- Modify: `packages/contracts/src/money.ts`
- Modify: `packages/contracts/src/debts.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `pnpm --filter @packages/contracts typecheck` (then web/api typecheck later)

**Interfaces:**
- Produces: `CurrencyCode`, `CurrencyKind`, `CurrencyDefinition`, `Money` as in the ready spec

- [ ] **Step 1: Replace `packages/contracts/src/money.ts`**

```ts
export type CurrencyCode = 'BRL' | 'USD' | 'EUR' | 'USDC' | 'USDT' | 'BTC';

export type CurrencyKind = 'fiat' | 'stablecoin' | 'crypto';

export type CurrencyDefinition = {
  code: CurrencyCode;
  scale: number;
  symbol: string;
  kind: CurrencyKind;
};

export type Money = {
  amountMinor: number;
  currency: CurrencyCode;
};
```

- [ ] **Step 2: Update `DebtsPanelCurrencyTotals` in `packages/contracts/src/debts.ts`**

Change `principal` and `balance` from `string` to `number` (amountMinor). Keep `currency: CurrencyCode`.

- [ ] **Step 3: Re-export new types from `packages/contracts/src/index.ts`**

```ts
export type {
  CurrencyCode,
  CurrencyDefinition,
  CurrencyKind,
  Money,
} from './money.js';
```

(Replace the existing Money/CurrencyCode export line — keep a single export block.)

- [ ] **Step 4: Typecheck contracts**

Run: `pnpm --filter @packages/contracts typecheck`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/money.ts packages/contracts/src/debts.ts packages/contracts/src/index.ts
git commit -m "$(cat <<'EOF'
feat(PP-48): close CurrencyCode and switch Money to amountMinor

EOF
)"
```

---

### Task 2: Domain — errors + currency catalog

**Files:**
- Create: `apps/api/src/features/fin/domain/currency/money-errors.ts`
- Create: `apps/api/src/features/fin/domain/currency/currency-catalog.ts`
- Create: `apps/api/src/features/fin/domain/currency/currency-catalog.spec.ts`
- Test: `pnpm --filter api test -- src/features/fin/domain/currency/currency-catalog.spec.ts`

**Interfaces:**
- Consumes: `CurrencyCode`, `CurrencyDefinition`, `CurrencyKind` from `@packages/contracts`
- Produces: `FinDomainError`, `isCurrencyCode`, `getCurrency`, `FIN_CURRENCY_CATALOG`

- [ ] **Step 1: Write failing catalog tests**

```ts
import { describe, expect, it } from 'vitest';
import { FIN_CURRENCY_CATALOG, getCurrency, isCurrencyCode } from './currency-catalog';
import { FinDomainError } from './money-errors';

describe('currency catalog', () => {
  it('versions the six MVP currencies with locked scales/symbols/kinds', () => {
    expect(Object.keys(FIN_CURRENCY_CATALOG).sort()).toEqual(
      ['BTC', 'BRL', 'EUR', 'USD', 'USDC', 'USDT'].sort(),
    );
    expect(FIN_CURRENCY_CATALOG.BRL).toMatchObject({
      scale: 2,
      symbol: 'R$',
      kind: 'fiat',
    });
    expect(FIN_CURRENCY_CATALOG.USD).toMatchObject({
      scale: 2,
      symbol: '$',
      kind: 'fiat',
    });
    expect(FIN_CURRENCY_CATALOG.EUR).toMatchObject({
      scale: 2,
      symbol: '€',
      kind: 'fiat',
    });
    expect(FIN_CURRENCY_CATALOG.USDC).toMatchObject({
      scale: 6,
      symbol: 'USDC',
      kind: 'stablecoin',
    });
    expect(FIN_CURRENCY_CATALOG.USDT).toMatchObject({
      scale: 6,
      symbol: 'USDT',
      kind: 'stablecoin',
    });
    expect(FIN_CURRENCY_CATALOG.BTC).toMatchObject({
      scale: 8,
      symbol: '₿',
      kind: 'crypto',
    });
  });

  it('accepts known codes via isCurrencyCode', () => {
    expect(isCurrencyCode('BRL')).toBe(true);
    expect(isCurrencyCode('brl')).toBe(false);
    expect(isCurrencyCode('XXX')).toBe(false);
    expect(isCurrencyCode('')).toBe(false);
  });

  it('getCurrency returns definition for known codes', () => {
    expect(getCurrency('BTC').symbol).toBe('₿');
  });

  it('getCurrency rejects unknown currency with FIN_CURRENCY_UNKNOWN', () => {
    expect(() => getCurrency('XXX')).toThrow(FinDomainError);
    try {
      getCurrency('XXX');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_CURRENCY_UNKNOWN',
        message: 'Currency is not in the MVP catalog',
        fields: { currency: ['Unknown currency code'] },
      });
    }
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter api test -- src/features/fin/domain/currency/currency-catalog.spec.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement errors + catalog**

`money-errors.ts`:

```ts
export type FinDomainErrorFields = Record<string, string[]>;

export class FinDomainError extends Error {
  readonly code: string;
  readonly fields: FinDomainErrorFields;

  constructor(code: string, message: string, fields: FinDomainErrorFields) {
    super(message);
    this.name = 'FinDomainError';
    this.code = code;
    this.fields = fields;
  }
}

export function currencyUnknownError(): FinDomainError {
  return new FinDomainError(
    'FIN_CURRENCY_UNKNOWN',
    'Currency is not in the MVP catalog',
    { currency: ['Unknown currency code'] },
  );
}

export function moneyAmountInvalidError(): FinDomainError {
  return new FinDomainError(
    'FIN_MONEY_AMOUNT_INVALID',
    'Money amountMinor must be a safe integer',
    { amountMinor: ['Must be a safe integer'] },
  );
}

export function moneyMajorInvalidError(): FinDomainError {
  return new FinDomainError(
    'FIN_MONEY_MAJOR_INVALID',
    'Money major amount string is invalid for currency scale',
    { amount: ['Invalid major amount for currency scale'] },
  );
}

export function moneyCurrencyMismatchError(): FinDomainError {
  return new FinDomainError(
    'FIN_MONEY_CURRENCY_MISMATCH',
    'Money arithmetic requires the same currency',
    { currency: ['Expected same currency on both operands'] },
  );
}
```

`currency-catalog.ts`:

```ts
import type { CurrencyCode, CurrencyDefinition } from '@packages/contracts';
import { currencyUnknownError } from './money-errors';

export const FIN_CURRENCY_CATALOG: Record<CurrencyCode, CurrencyDefinition> = {
  BRL: { code: 'BRL', scale: 2, symbol: 'R$', kind: 'fiat' },
  USD: { code: 'USD', scale: 2, symbol: '$', kind: 'fiat' },
  EUR: { code: 'EUR', scale: 2, symbol: '€', kind: 'fiat' },
  USDC: { code: 'USDC', scale: 6, symbol: 'USDC', kind: 'stablecoin' },
  USDT: { code: 'USDT', scale: 6, symbol: 'USDT', kind: 'stablecoin' },
  BTC: { code: 'BTC', scale: 8, symbol: '₿', kind: 'crypto' },
};

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(FIN_CURRENCY_CATALOG, value);
}

export function getCurrency(code: string): CurrencyDefinition {
  if (!isCurrencyCode(code)) {
    throw currencyUnknownError();
  }
  return FIN_CURRENCY_CATALOG[code];
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter api test -- src/features/fin/domain/currency/currency-catalog.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/features/fin/domain/currency/money-errors.ts \
  apps/api/src/features/fin/domain/currency/currency-catalog.ts \
  apps/api/src/features/fin/domain/currency/currency-catalog.spec.ts
git commit -m "$(cat <<'EOF'
feat(PP-48): add fin currency catalog and domain errors

EOF
)"
```

---

### Task 3: Domain — Money helpers

**Files:**
- Create: `apps/api/src/features/fin/domain/currency/money.ts`
- Create: `apps/api/src/features/fin/domain/currency/money.spec.ts`
- Test: `pnpm --filter api test -- src/features/fin/domain/currency/money.spec.ts`

**Interfaces:**
- Consumes: catalog + `FinDomainError` factories; `Money` / `CurrencyCode` from contracts
- Produces: `createMoney`, `parseMajorToMoney`, `formatMoney`, `addMoney`, `subtractMoney`

- [ ] **Step 1: Write failing money helper tests**

Cover every scenario from the ready spec (create valid/invalid; add/sub same + mismatch + overflow; parse pad / exact / excess / invalid / negative; format round-trip for BRL/USDC/BTC).

```ts
import { describe, expect, it } from 'vitest';
import { FinDomainError } from './money-errors';
import {
  addMoney,
  createMoney,
  formatMoney,
  parseMajorToMoney,
  subtractMoney,
} from './money';

describe('createMoney', () => {
  it('creates money for a catalog currency including zero and negatives', () => {
    expect(createMoney(1050, 'BRL')).toEqual({ amountMinor: 1050, currency: 'BRL' });
    expect(createMoney(0, 'BRL').amountMinor).toBe(0);
    expect(createMoney(-1, 'USD').amountMinor).toBe(-1);
    expect(createMoney(Number.MAX_SAFE_INTEGER, 'EUR').amountMinor).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('rejects non-safe-integer amountMinor with full error shape', () => {
    expect(() => createMoney(1.5, 'BRL')).toThrow(FinDomainError);
    try {
      createMoney(Number.NaN, 'BRL');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_MONEY_AMOUNT_INVALID',
        message: 'Money amountMinor must be a safe integer',
        fields: { amountMinor: ['Must be a safe integer'] },
      });
    }
  });
});

describe('parseMajorToMoney / formatMoney', () => {
  it('parses exact scale and formats with exact scale', () => {
    const money = parseMajorToMoney('10.50', 'BRL');
    expect(money).toEqual({ amountMinor: 1050, currency: 'BRL' });
    expect(formatMoney(money)).toBe('10.50');
  });

  it('pads fewer fractional digits', () => {
    expect(parseMajorToMoney('10.5', 'BRL').amountMinor).toBe(1050);
    expect(parseMajorToMoney('10', 'BRL').amountMinor).toBe(1000);
  });

  it('rejects more fractional digits than scale with full error shape', () => {
    expect(() => parseMajorToMoney('10.501', 'BRL')).toThrow(FinDomainError);
    try {
      parseMajorToMoney('10.501', 'BRL');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_MONEY_MAJOR_INVALID',
        message: 'Money major amount string is invalid for currency scale',
        fields: { amount: ['Invalid major amount for currency scale'] },
      });
    }
  });

  it('rejects invalid major strings without trimming', () => {
    for (const major of ['', 'abc', '10.5.0', ' 10.50 ', '+10.50', '1e2', '1,050.00']) {
      expect(() => parseMajorToMoney(major, 'BRL')).toThrow(FinDomainError);
    }
  });

  it('accepts negative majors', () => {
    expect(parseMajorToMoney('-10.50', 'BRL').amountMinor).toBe(-1050);
  });

  it('round-trips USDC and BTC scales', () => {
    expect(parseMajorToMoney('1.000000', 'USDC').amountMinor).toBe(1_000_000);
    expect(formatMoney(createMoney(1_000_000, 'USDC'))).toBe('1.000000');
    expect(parseMajorToMoney('0.00000001', 'BTC').amountMinor).toBe(1);
    expect(formatMoney(createMoney(1, 'BTC'))).toBe('0.00000001');
  });
});

describe('addMoney / subtractMoney', () => {
  it('adds and subtracts same currency', () => {
    const a = createMoney(1000, 'BRL');
    const b = createMoney(250, 'BRL');
    expect(addMoney(a, b)).toEqual({ amountMinor: 1250, currency: 'BRL' });
    expect(subtractMoney(a, b)).toEqual({ amountMinor: 750, currency: 'BRL' });
  });

  it('rejects currency mismatch with full error shape', () => {
    expect(() => addMoney(createMoney(1, 'BRL'), createMoney(1, 'USD'))).toThrow(
      FinDomainError,
    );
    try {
      subtractMoney(createMoney(1, 'BRL'), createMoney(1, 'USD'));
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_MONEY_CURRENCY_MISMATCH',
        message: 'Money arithmetic requires the same currency',
        fields: { currency: ['Expected same currency on both operands'] },
      });
    }
  });

  it('rejects safe-integer overflow and underflow', () => {
    expect(() =>
      addMoney(createMoney(Number.MAX_SAFE_INTEGER, 'BRL'), createMoney(1, 'BRL')),
    ).toThrow(FinDomainError);
    try {
      subtractMoney(
        createMoney(Number.MIN_SAFE_INTEGER, 'BRL'),
        createMoney(1, 'BRL'),
      );
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_MONEY_AMOUNT_INVALID',
        fields: { amountMinor: ['Must be a safe integer'] },
      });
    }
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter api test -- src/features/fin/domain/currency/money.spec.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `money.ts`**

Implement helpers to match the locked parse/format/overflow rules. Suggested approach:

- `createMoney`: `Number.isSafeInteger(amountMinor)` else throw; currency must already be `CurrencyCode` (caller typed) — still fine to trust the union at this boundary.
- `parseMajorToMoney`: match `/^-?\d+(\.\d+)?$/` only; split integer/fraction; if fraction length > scale → major invalid; pad fraction to scale; combine into minor via string (avoid float); ensure result is safe integer.
- `formatMoney`: split absolute minor by `10**scale` using integer math / string pad; preserve sign.
- `addMoney`/`subtractMoney`: currency equality check; use a checked sum that throws if `!Number.isSafeInteger(result)`.

Do **not** use floating-point multiplication for major↔minor (e.g. avoid `parseFloat(major) * 10**scale`). Prefer digit-string conversion.

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter api test -- src/features/fin/domain/currency/money.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/features/fin/domain/currency/money.ts \
  apps/api/src/features/fin/domain/currency/money.spec.ts
git commit -m "$(cat <<'EOF'
feat(PP-48): add Money domain helpers with catalog validation

EOF
)"
```

---

### Task 4: Web fixtures + living refs

**Files:**
- Modify: `apps/web/src/lib/api-contracts/panels.ts`
- Modify: `apps/web/src/lib/api-contracts/panels.test.ts`
- Modify: `refs/monorepo-contracts.md`
- Modify: `refs/monorepo-fin-module.md`
- Test: `pnpm --filter web test -- src/lib/api-contracts/panels.test.ts` and `pnpm typecheck`

**Interfaces:**
- Consumes: new `Money` / `CurrencyCode` from contracts

- [ ] **Step 1: Update fixture helper and debts totals**

In `panels.ts`:

```ts
const asCurrency = (code: CurrencyCode): CurrencyCode => code;
const money = (amountMinor: number, code: CurrencyCode = 'BRL'): Money => ({
  amountMinor,
  currency: asCurrency(code),
});

export const exampleMoney = money(1050);
```

Replace every former major-string call accordingly, e.g. `'10.50'` → `1050`, `'0.00'` → `0`, `'100.00'` → `10000`, `'500.00'` → `50000`, `'400.00'` → `40000`, `'120.00'` → `12000`, `'280.00'` → `28000`, `'50.00'` → `5000`, `'20.00'` → `2000`, `'40.00'` → `4000`, `'1000.00'` → `100000`, `'750.00'` → `75000`, `'700.00'` → `70000`.

Update debts totals:

```ts
totalsByCurrency: [
  {
    currency: asCurrency('BRL'),
    principal: 100_000,
    balance: 75_000,
  },
],
```

- [ ] **Step 2: Update `panels.test.ts` assertions**

```ts
expect(exampleMoney.amountMinor).toBe(1050);
// ...
expect(exampleDebtsPanel.totalsByCurrency[0]?.principal).toBe(100_000);
expect(exampleDebtsPanel.totalsByCurrency[0]?.balance).toBe(75_000);
// ...
expect(exampleBudgetHome.totals.overspentAmount.amountMinor).toBe(0);
```

Remove any `.amount` string assertions.

- [ ] **Step 3: Update refs**

`refs/monorepo-contracts.md`:
- Set `Reviewed: 2026-08-30` (already dated — bump if stamp format requires today's verify).
- Money row: `Money = { amountMinor: number /* safe integer */; currency: CurrencyCode }` with closed MVP union including USDC/USDT/BTC.
- Replace ISO-4217-open branding rule with closed catalog union; note runtime catalog + helpers live in API domain (`apps/api/src/features/fin/domain/currency/`).
- Debts totals: principal/balance are amountMinor numbers under row currency.

`refs/monorepo-fin-module.md`:
- Status/Reviewed stamp bump.
- Note domain currency path exists; document invariant **1 conta = 1 moeda** / posting currency must match account (consumed by PP-49).
- Remove any “no fin domain today” caveat that this PR resolves.
- Keep Money shared at `packages/contracts/src/money.ts`.

- [ ] **Step 4: Run web tests + root typecheck**

Run: `pnpm --filter web test -- src/lib/api-contracts/panels.test.ts`  
Expected: PASS

Run: `pnpm typecheck`  
Expected: PASS (api + web + contracts)

Run: `pnpm --filter api test -- src/features/fin/domain/currency`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api-contracts/panels.ts \
  apps/web/src/lib/api-contracts/panels.test.ts \
  refs/monorepo-contracts.md \
  refs/monorepo-fin-module.md
git commit -m "$(cat <<'EOF'
feat(PP-48): update fixtures and refs for amountMinor Money

EOF
)"
```

---

## Self-review

1. **Spec coverage:** contracts Money/CurrencyCode → Task 1; catalog + errors → Task 2; helpers + parse rules/overflow → Task 3; fixtures + refs + 1 conta = 1 moeda docs → Task 4. HTTP deferred (no task). No FinModule (YAGNI).
2. **Placeholders:** none — code and commands are concrete.
3. **Type consistency:** `parseMajorToMoney` / `amountMinor` / error codes match the ready spec throughout.
