import { describe, expect, it } from 'vitest';
import {
  FIN_CURRENCY_CATALOG,
  getCurrency,
  isCurrencyCode,
} from './currency-catalog';
import { FinDomainError } from './money-errors';

describe('currency catalog', () => {
  it('versions the MVP currencies with locked scales/symbols/kinds', () => {
    expect(Object.keys(FIN_CURRENCY_CATALOG).sort()).toEqual(
      ['BTC', 'BRL', 'DEPIX', 'EUR', 'USD', 'USDC', 'USDT'].sort(),
    );
    expect(FIN_CURRENCY_CATALOG.BRL).toMatchObject({
      scale: 2,
      symbol: 'R$',
      kind: 'fiat',
    });
    expect(FIN_CURRENCY_CATALOG.USD).toMatchObject({
      scale: 2,
      symbol: '$',
      kind: 'fiat',
    });
    expect(FIN_CURRENCY_CATALOG.EUR).toMatchObject({
      scale: 2,
      symbol: '€',
      kind: 'fiat',
    });
    expect(FIN_CURRENCY_CATALOG.USDC).toMatchObject({
      scale: 6,
      symbol: 'USDC',
      kind: 'stablecoin',
    });
    expect(FIN_CURRENCY_CATALOG.USDT).toMatchObject({
      scale: 6,
      symbol: 'USDT',
      kind: 'stablecoin',
    });
    expect(FIN_CURRENCY_CATALOG.BTC).toMatchObject({
      scale: 8,
      symbol: '₿',
      kind: 'crypto',
    });
    expect(FIN_CURRENCY_CATALOG.DEPIX).toMatchObject({
      scale: 8,
      symbol: 'DePIX',
      kind: 'stablecoin',
    });
  });

  it('accepts known codes via isCurrencyCode', () => {
    expect(isCurrencyCode('BRL')).toBe(true);
    expect(isCurrencyCode('brl')).toBe(false);
    expect(isCurrencyCode('XXX')).toBe(false);
    expect(isCurrencyCode('')).toBe(false);
  });

  it('getCurrency returns definition for known codes', () => {
    expect(getCurrency('BTC').symbol).toBe('₿');
  });

  it('getCurrency rejects unknown currency with FIN_CURRENCY_UNKNOWN', () => {
    expect(() => getCurrency('XXX')).toThrow(FinDomainError);
    try {
      getCurrency('XXX');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'FIN_CURRENCY_UNKNOWN',
        message: 'Currency is not in the MVP catalog',
        fields: { currency: ['Unknown currency code'] },
      });
    }
  });
});
