import type { CurrencyCode, CurrencyDefinition } from '@packages/contracts';
import { currencyUnknownError } from './money-errors';

export const FIN_CURRENCY_CATALOG: Record<CurrencyCode, CurrencyDefinition> = {
  BRL: { code: 'BRL', scale: 2, symbol: 'R$', kind: 'fiat' },
  USD: { code: 'USD', scale: 2, symbol: '$', kind: 'fiat' },
  EUR: { code: 'EUR', scale: 2, symbol: '€', kind: 'fiat' },
  USDC: { code: 'USDC', scale: 6, symbol: 'USDC', kind: 'stablecoin' },
  USDT: { code: 'USDT', scale: 6, symbol: 'USDT', kind: 'stablecoin' },
  BTC: { code: 'BTC', scale: 8, symbol: '₿', kind: 'crypto' },
  DEPIX: { code: 'DEPIX', scale: 8, symbol: 'DePIX', kind: 'stablecoin' },
};

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(FIN_CURRENCY_CATALOG, value);
}

export function getCurrency(code: string): CurrencyDefinition {
  if (!isCurrencyCode(code)) {
    throw currencyUnknownError();
  }
  return FIN_CURRENCY_CATALOG[code];
}
