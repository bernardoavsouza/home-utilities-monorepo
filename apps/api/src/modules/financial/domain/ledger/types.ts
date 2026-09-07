import type { CurrencyCode } from '@packages/contracts';

export type FinAccountTypeName =
  'asset' | 'liability' | 'income' | 'expense' | 'equity';

export type FinJournalSideName = 'debit' | 'credit';

export type FinSystemAccountKindName =
  'income' | 'expense' | 'exchange' | 'opening_balance';

export type FinEntryKind =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'pay_liability'
  | 'exchange'
  | 'split'
  | 'opening_balance'
  | 'reversal';

export type BalancedLineDraft = {
  readonly accountId: string;
  readonly side: FinJournalSideName;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
};

export type PostLineDraft = {
  readonly accountId: string;
  readonly side: FinJournalSideName;
  readonly amountMinor: number;
};
