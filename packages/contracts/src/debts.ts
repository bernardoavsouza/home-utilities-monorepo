import type { CurrencyCode, Money } from './money.js';

export type DebtStatus = 'active' | 'paid' | 'archived';

export type DebtSummary = {
  id: string;
  name: string;
  status: DebtStatus;
  principal: Money;
  balance: Money;
};

export type DebtDetail = DebtSummary & {
  notes: string | null;
  openedOn: string | null;
  dueOn: string | null;
};

export type DebtsPanelCurrencyTotals = {
  currency: CurrencyCode;
  principal: number;
  balance: number;
};

export type DebtsPanelResponse = {
  totalsByCurrency: DebtsPanelCurrencyTotals[];
  debts: DebtSummary[];
};

export type CreateDebtRequest = {
  name: string;
  principal: Money;
  balance?: Money;
  notes?: string | null;
  openedOn?: string | null;
  dueOn?: string | null;
};

export type RegisterDebtPaymentRequest = {
  amount: Money;
  occurredOn: string;
  note?: string;
};

export type RegisterDebtPaymentResponse = {
  debt: DebtDetail;
  postingId: string;
};
