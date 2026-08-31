import type { CurrencyCode, CurrencyDefinition } from '@packages/contracts';
import { currencyUnknownError } from './money-errors';

export const FIN_CURRENCY_CATALOG = {
  BRL: { code: 'BRL', scale: 2, symbol: 'R$', kind: 'fiat' },
  USD: { code: 'USD', scale: 2, symbol: '$', kind: 'fiat' },
  EUR: { code: 'EUR', scale: 2, symbol: '€', kind: 'fiat' },
  USDC: { code: 'USDC', scale: 6, symbol: 'USDC', kind: 'stablecoin' },
  USDT: { code: 'USDT', scale: 6, symbol: 'USDT', kind: 'stablecoin' },
  BTC: { code: 'BTC', scale: 8, symbol: '₿', kind: 'crypto' },
  DEPIX: { code: 'DEPIX', scale: 8, symbol: 'DePIX', kind: 'stablecoin' },
} as const satisfies Record<CurrencyCode, CurrencyDefinition>;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(FIN_CURRENCY_CATALOG, value);
}

export function assertCurrency(code: string): asserts code is CurrencyCode {
  if (!isCurrencyCode(code)) {
    throw currencyUnknownError();
  }
}

export function getCurrency(code: string): CurrencyDefinition {
  assertCurrency(code);
  return FIN_CURRENCY_CATALOG[code];
}
