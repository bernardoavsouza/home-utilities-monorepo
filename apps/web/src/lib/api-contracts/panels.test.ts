import { describe, expect, it } from 'vitest';
import { exampleMoney } from './panels';

describe('api-contracts money fixture', () => {
  it('exposes money with currency and amountMinor', () => {
    expect(exampleMoney.currency).toBe('BRL');
    expect(exampleMoney.amountMinor).toBe(1050);
  });
});
