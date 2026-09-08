export type FinAccountTypeName =
  'asset' | 'liability' | 'income' | 'expense' | 'equity';

export type FinJournalSideName = 'debit' | 'credit';

export type FinSystemAccountKindName =
  'income' | 'expense' | 'exchange' | 'opening_balance';

export type FinEntryKindName =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'pay_liability'
  | 'exchange'
  | 'split'
  | 'opening_balance'
  | 'reversal';

export type PostLineDraft = {
  readonly accountId: string;
  readonly side: FinJournalSideName;
  readonly amountMinor: number;
};
