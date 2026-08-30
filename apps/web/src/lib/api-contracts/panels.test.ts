import { describe, expect, it } from 'vitest';
import {
  exampleAuthSession,
  exampleBudgetHome,
  exampleDashboard,
  exampleDebtsPanel,
  exampleMoney,
  exampleProjection,
  exampleTransaction,
  exampleUnauthenticatedSession,
} from './panels';

describe('api-contracts panel fixtures', () => {
  it('exposes money with currency', () => {
    expect(exampleMoney.currency).toBe('BRL');
    expect(exampleMoney.amountMinor).toBe(1050);
  });

  it('exposes authenticated and unauthenticated sessions', () => {
    expect(exampleAuthSession.authenticated).toBe(true);
    expect(exampleUnauthenticatedSession.authenticated).toBe(false);
  });

  it('exposes budget home monetary fields with currency', () => {
    expect(exampleBudgetHome.readyToAssign.currency).toBe('BRL');
    expect(exampleBudgetHome.groups[0]?.categories[0]?.assigned.currency).toBe(
      'BRL',
    );
  });

  it('links transactions to a posting id', () => {
    expect(exampleTransaction.postingId).toBe('post-1');
  });

  it('exposes debts, projection, and dashboard panels', () => {
    expect(exampleDebtsPanel.totalsByCurrency).toHaveLength(1);
    expect(exampleDebtsPanel.totalsByCurrency[0]?.principal).toBe(100_000);
    expect(exampleDebtsPanel.totalsByCurrency[0]?.balance).toBe(75_000);
    expect(exampleDebtsPanel.debts).toHaveLength(1);
    expect(exampleProjection.horizonMonths).toBe(3);
    expect(exampleProjection.points).toHaveLength(1);
    expect(exampleDashboard.overspent).toBe(false);
    expect(exampleDashboard.byGroup).toHaveLength(1);
  });

  it('keeps budget overspent boolean distinct from overspentAmount money', () => {
    expect(exampleBudgetHome.totals.overspentAmount.amountMinor).toBe(0);
    expect(exampleBudgetHome.groups[0]?.categories[0]?.overspent).toBe(false);
  });
});
