import type { CurrencyCode, Money } from './money.js';
import type { BudgetMonth } from './budget.js';

export type ProjectionHorizonMonths = 3 | 6 | 12;

export type ProjectionQuery = {
  horizonMonths: ProjectionHorizonMonths;
  currency?: CurrencyCode;
};

export type ProjectionMonthPoint = {
  month: BudgetMonth;
  income: Money;
  expenses: Money;
  debtPayments: Money;
  net: Money;
  projectedBalance: Money;
};

export type ProjectionResponse = {
  currency: CurrencyCode;
  horizonMonths: number;
  assumptions: {
    includeBudgetAssigned: boolean;
    includeDebts: boolean;
    note: string;
  };
  points: ProjectionMonthPoint[];
};
