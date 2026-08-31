import { describe, expect, it } from 'vitest';
import { FinDomainError } from './money-errors';
import {
  addMoney,
  createMoney,
  formatMoney,
  parseMajorToMoney,
  subtractMoney,
} from './money';

describe('createMoney', () => {
  it('creates money for a catalog currency including zero and negatives', () => {
    expect(createMoney(1050, 'BRL')).toEqual({
      amountMinor: 1050,
      currency: 'BRL',
    });
    expect(createMoney(0, 'BRL').amountMinor).toBe(0);
    expect(createMoney(-1, 'USD').amountMinor).toBe(-1);
    expect(createMoney(Number.MAX_SAFE_INTEGER, 'EUR').amountMinor).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('rejects non-safe-integer amountMinor with full error shape', () => {
    expect(() => createMoney(1.5, 'BRL')).toThrow(FinDomainError);
    try {
      createMoney(Number.NaN, 'BRL');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_MONEY_AMOUNT_INVALID',
        message: 'Money amountMinor must be a safe integer',
        fields: { amountMinor: ['Must be a safe integer'] },
      });
    }
  });
});

describe('parseMajorToMoney / formatMoney', () => {
  it('parses exact scale and formats with exact scale', () => {
    const money = parseMajorToMoney('10.50', 'BRL');
    expect(money).toEqual({ amountMinor: 1050, currency: 'BRL' });
    expect(formatMoney(money)).toBe('10.50');
  });

  it('pads fewer fractional digits', () => {
    expect(parseMajorToMoney('10.5', 'BRL').amountMinor).toBe(1050);
    expect(parseMajorToMoney('10', 'BRL').amountMinor).toBe(1000);
  });

  it('rejects more fractional digits than scale with full error shape', () => {
    expect(() => parseMajorToMoney('10.501', 'BRL')).toThrow(FinDomainError);
    try {
      parseMajorToMoney('10.501', 'BRL');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_MONEY_MAJOR_INVALID',
        message: 'Money major amount string is invalid for currency scale',
        fields: { amount: ['Invalid major amount for currency scale'] },
      });
    }
  });

  it('rejects invalid major strings without trimming', () => {
    for (const major of [
      '',
      'abc',
      '10.5.0',
      ' 10.50 ',
      '+10.50',
      '1e2',
      '1,050.00',
    ]) {
      expect(() => parseMajorToMoney(major, 'BRL')).toThrow(FinDomainError);
    }
  });

  it('accepts negative majors', () => {
    expect(parseMajorToMoney('-10.50', 'BRL').amountMinor).toBe(-1050);
  });

  it('round-trips USDC and BTC scales', () => {
    expect(parseMajorToMoney('1.000000', 'USDC').amountMinor).toBe(1_000_000);
    expect(formatMoney(createMoney(1_000_000, 'USDC'))).toBe('1.000000');
    expect(parseMajorToMoney('0.00000001', 'BTC').amountMinor).toBe(1);
    expect(formatMoney(createMoney(1, 'BTC'))).toBe('0.00000001');
  });
});

describe('addMoney / subtractMoney', () => {
  it('adds and subtracts same currency', () => {
    const a = createMoney(1000, 'BRL');
    const b = createMoney(250, 'BRL');
    expect(addMoney(a, b)).toEqual({ amountMinor: 1250, currency: 'BRL' });
    expect(subtractMoney(a, b)).toEqual({ amountMinor: 750, currency: 'BRL' });
  });

  it('rejects currency mismatch with full error shape', () => {
    expect(() =>
      addMoney(createMoney(1, 'BRL'), createMoney(1, 'USD')),
    ).toThrow(FinDomainError);
    try {
      subtractMoney(createMoney(1, 'BRL'), createMoney(1, 'USD'));
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_MONEY_CURRENCY_MISMATCH',
        message: 'Money arithmetic requires the same currency',
        fields: { currency: ['Expected same currency on both operands'] },
      });
    }
  });

  it('rejects safe-integer overflow and underflow', () => {
    expect(() =>
      addMoney(
        createMoney(Number.MAX_SAFE_INTEGER, 'BRL'),
        createMoney(1, 'BRL'),
      ),
    ).toThrow(FinDomainError);
    try {
      subtractMoney(
        createMoney(Number.MIN_SAFE_INTEGER, 'BRL'),
        createMoney(1, 'BRL'),
      );
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_MONEY_AMOUNT_INVALID',
        fields: { amountMinor: ['Must be a safe integer'] },
      });
    }
  });
});
