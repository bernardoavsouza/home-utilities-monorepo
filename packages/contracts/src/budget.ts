import type { CurrencyCode, Money } from './money.js';

export type BudgetMonth = string & { readonly __brand: 'BudgetMonth' };

export type BudgetCategoryLine = {
  id: string;
  name: string;
  assigned: Money;
  spent: Money;
  available: Money;
  overspent: boolean;
};

export type BudgetGroup = {
  id: string;
  name: string;
  categories: BudgetCategoryLine[];
};

export type BudgetHomeResponse = {
  month: BudgetMonth;
  currency: CurrencyCode;
  readyToAssign: Money;
  totals: {
    income: Money;
    assigned: Money;
    spent: Money;
    available: Money;
    overspentAmount: Money;
  };
  groups: BudgetGroup[];
};

export type AssignCategoryRequest = {
  month: BudgetMonth;
  categoryId: string;
  amount: Money;
};

export type AssignCategoryResponse = {
  category: BudgetCategoryLine;
  readyToAssign: Money;
};

export type MoveMoneyRequest = {
  month: BudgetMonth;
  fromCategoryId: string;
  toCategoryId: string;
  amount: Money;
};

export type MoveMoneyResponse = {
  from: BudgetCategoryLine;
  to: BudgetCategoryLine;
  readyToAssign: Money;
};
