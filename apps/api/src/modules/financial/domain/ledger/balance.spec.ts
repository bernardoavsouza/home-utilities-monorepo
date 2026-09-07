import { describe, expect, it } from 'vitest';
import { FinDomainError } from '@/modules/financial/domain/currency/money-errors';
import {
  assertEntryBalanced,
  assertNonNegativeAmountMinor,
  computeSignedBalance,
} from '@/modules/financial/domain/ledger/balance';

describe('assertEntryBalanced', () => {
  it('accepts a same-currency balanced entry', () => {
    expect(() =>
      assertEntryBalanced([
        { side: 'debit', amountMinor: 1000, currency: 'BRL' },
        { side: 'credit', amountMinor: 1000, currency: 'BRL' },
      ]),
    ).not.toThrow();
  });

  it('accepts multi-currency when each currency balances', () => {
    expect(() =>
      assertEntryBalanced([
        { side: 'debit', amountMinor: 1000, currency: 'BRL' },
        { side: 'credit', amountMinor: 1000, currency: 'BRL' },
        { side: 'debit', amountMinor: 180, currency: 'USD' },
        { side: 'credit', amountMinor: 180, currency: 'USD' },
      ]),
    ).not.toThrow();
  });

  it('rejects when one currency is unbalanced', () => {
    expect.assertions(1);
    try {
      assertEntryBalanced([
        { side: 'debit', amountMinor: 1000, currency: 'BRL' },
        { side: 'credit', amountMinor: 900, currency: 'BRL' },
        { side: 'debit', amountMinor: 180, currency: 'USD' },
        { side: 'credit', amountMinor: 180, currency: 'USD' },
      ]);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_ENTRY_UNBALANCED',
        fields: { entry: ['Debits and credits must match per currency'] },
      });
    }
  });

  it('rejects fewer than two lines', () => {
    expect(() =>
      assertEntryBalanced([{ side: 'debit', amountMinor: 1, currency: 'BRL' }]),
    ).toThrow(FinDomainError);
    try {
      assertEntryBalanced([]);
    } catch (error) {
      expect(error).toMatchObject({ code: 'FIN_ENTRY_TOO_FEW_LINES' });
    }
  });

  it('rejects negative or non-safe amountMinor', () => {
    expect(() =>
      assertEntryBalanced([
        { side: 'debit', amountMinor: -1, currency: 'BRL' },
        { side: 'credit', amountMinor: -1, currency: 'BRL' },
      ]),
    ).toThrow(FinDomainError);
    expect(() => assertNonNegativeAmountMinor(1.5)).toThrow(FinDomainError);
  });

  it('rejects unknown currency', () => {
    expect.assertions(1);
    try {
      assertEntryBalanced([
        { side: 'debit', amountMinor: 1, currency: 'XXX' },
        { side: 'credit', amountMinor: 1, currency: 'XXX' },
      ]);
    } catch (error) {
      expect(error).toMatchObject({ code: 'FIN_CURRENCY_UNKNOWN' });
    }
  });
});

describe('computeSignedBalance', () => {
  it('uses debit-normal for asset and expense', () => {
    expect(computeSignedBalance('asset', 100, 40)).toBe(60);
    expect(computeSignedBalance('expense', 50, 0)).toBe(50);
  });

  it('uses credit-normal for liability, income, equity', () => {
    expect(computeSignedBalance('liability', 40, 100)).toBe(60);
    expect(computeSignedBalance('income', 0, 25)).toBe(25);
    expect(computeSignedBalance('equity', 10, 10)).toBe(0);
  });
});
