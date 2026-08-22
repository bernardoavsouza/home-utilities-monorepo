import type { Money } from './money.js';
import type { BudgetMonth } from './budget.js';

export type BudgetTransaction = {
  id: string;
  month: BudgetMonth;
  categoryId: string;
  note: string | null;
  amount: Money;
  occurredOn: string;
  postingId: string;
};

export type CreateTransactionRequest = {
  month: BudgetMonth;
  categoryId: string;
  note?: string | null;
  amount: Money;
  occurredOn: string;
};

export type UpdateTransactionRequest = {
  categoryId?: string;
  note?: string | null;
  amount?: Money;
  occurredOn?: string;
};

export type DeleteTransactionResponse = {
  id: string;
  reversedPostingId: string | null;
};

export type TransactionListResponse = {
  month: BudgetMonth;
  items: BudgetTransaction[];
  total: Money;
};
