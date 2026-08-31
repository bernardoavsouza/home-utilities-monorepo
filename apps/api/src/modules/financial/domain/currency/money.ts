import type { CurrencyCode, Money } from '@packages/contracts';
import { assertCurrency, getCurrency } from './currency-catalog';
import {
  moneyAmountInvalidError,
  moneyCurrencyMismatchError,
  moneyMajorInvalidError,
  moneyOverflowError,
} from './money-errors';

const MAJOR_PATTERN = /^-?\d+(\.\d+)?$/;

export function createMoney(
  amountMinor: number,
  currency: CurrencyCode,
): Money {
  assertCurrency(currency);
  if (!Number.isSafeInteger(amountMinor)) {
    throw moneyAmountInvalidError();
  }
  return { amountMinor: amountMinor === 0 ? 0 : amountMinor, currency };
}

export function parseMajorToMoney(
  major: string,
  currency: CurrencyCode,
): Money {
  const definition = getCurrency(currency);
  if (!MAJOR_PATTERN.test(major)) {
    throw moneyMajorInvalidError();
  }

  const negative = major.startsWith('-');
  const unsigned = negative ? major.slice(1) : major;
  const [wholePart = '0', fractionPart = ''] = unsigned.split('.');

  if (fractionPart.length > definition.scale) {
    throw moneyMajorInvalidError();
  }

  const paddedFraction = fractionPart.padEnd(definition.scale, '0');
  const digits = `${wholePart}${paddedFraction}`;
  const parsed = Number(`${negative ? '-' : ''}${digits}`);

  if (!Number.isSafeInteger(parsed)) {
    throw moneyMajorInvalidError();
  }

  const amountMinor = parsed === 0 ? 0 : parsed;
  return { amountMinor, currency };
}

export function formatMoney(money: Money): string {
  const definition = getCurrency(money.currency);
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw moneyAmountInvalidError();
  }

  const negative = money.amountMinor < 0;
  const absolute = Math.abs(money.amountMinor).toString();
  const padded = absolute.padStart(definition.scale + 1, '0');
  const cut = padded.length - definition.scale;
  const major = `${padded.slice(0, cut)}.${padded.slice(cut)}`;
  return negative ? `-${major}` : major;
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(
    checkedSum(left.amountMinor, right.amountMinor),
    left.currency,
  );
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return createMoney(
    checkedSum(left.amountMinor, -right.amountMinor),
    left.currency,
  );
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw moneyCurrencyMismatchError();
  }
}

function checkedSum(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw moneyOverflowError();
  }
  return result;
}
