import type { Money } from './money.js';
import type { BudgetMonth } from './budget.js';

export type IncomeEntry = {
  id: string;
  month: BudgetMonth;
  note: string | null;
  amount: Money;
  occurredOn: string;
};

export type CreateIncomeRequest = {
  month: BudgetMonth;
  note?: string | null;
  amount: Money;
  occurredOn: string;
};

export type UpdateIncomeRequest = {
  note?: string | null;
  amount?: Money;
  occurredOn?: string;
};

export type IncomeListResponse = {
  month: BudgetMonth;
  items: IncomeEntry[];
  total: Money;
};
