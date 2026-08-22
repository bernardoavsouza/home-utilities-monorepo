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
    expect(exampleMoney.amount).toBe('10.50');
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
    expect(exampleDebtsPanel.debts).toHaveLength(1);
    expect(exampleProjection.points).toHaveLength(1);
    expect(exampleDashboard.byGroup).toHaveLength(1);
  });
});
