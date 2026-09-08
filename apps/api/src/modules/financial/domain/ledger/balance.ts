import type { CurrencyCode } from '@packages/contracts';
import { assertCurrency } from '@/modules/financial/domain/currency/currency-catalog';
import {
  entryTooFewLinesError,
  entryUnbalancedError,
  lineAmountInvalidError,
} from '@/modules/financial/domain/ledger/ledger-errors';
import type {
  FinAccountTypeName,
  FinJournalSideName,
} from '@/modules/financial/domain/ledger/types';

export type BalanceLineInput = {
  readonly side: FinJournalSideName;
  readonly amountMinor: number;
  readonly currency: string;
};

export function assertNonNegativeAmountMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw lineAmountInvalidError();
  }
}

export function assertEntryBalanced(lines: readonly BalanceLineInput[]): void {
  if (lines.length < 2) {
    throw entryTooFewLinesError();
  }

  const totals = new Map<CurrencyCode, { debit: number; credit: number }>();

  for (const line of lines) {
    assertNonNegativeAmountMinor(line.amountMinor);
    assertCurrency(line.currency);
    const currency = line.currency;
    const bucket = totals.get(currency) ?? { debit: 0, credit: 0 };
    if (line.side === 'debit') {
      bucket.debit += line.amountMinor;
    } else {
      bucket.credit += line.amountMinor;
    }
    if (
      !Number.isSafeInteger(bucket.debit) ||
      !Number.isSafeInteger(bucket.credit)
    ) {
      throw lineAmountInvalidError();
    }
    totals.set(currency, bucket);
  }

  for (const bucket of totals.values()) {
    if (bucket.debit !== bucket.credit) {
      throw entryUnbalancedError();
    }
  }
}

export function computeSignedBalance(
  type: FinAccountTypeName,
  debitTotal: number,
  creditTotal: number,
): number {
  if (
    !Number.isSafeInteger(debitTotal) ||
    !Number.isSafeInteger(creditTotal) ||
    debitTotal < 0 ||
    creditTotal < 0
  ) {
    throw lineAmountInvalidError();
  }

  const normalDebit = type === 'asset' || type === 'expense';
  const signed = normalDebit
    ? debitTotal - creditTotal
    : creditTotal - debitTotal;

  if (!Number.isSafeInteger(signed)) {
    throw lineAmountInvalidError();
  }
  return signed;
}
