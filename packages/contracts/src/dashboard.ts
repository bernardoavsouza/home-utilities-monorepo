import type { CurrencyCode, Money } from './money.js';
import type { BudgetMonth } from './budget.js';

export type DashboardGroupBreakdown = {
  groupId: string;
  name: string;
  assigned: Money;
  spent: Money;
};

export type DashboardResponse = {
  month: BudgetMonth;
  currency: CurrencyCode;
  income: Money;
  assigned: Money;
  spent: Money;
  readyToAssign: Money;
  overspent: boolean;
  byGroup: DashboardGroupBreakdown[];
};
