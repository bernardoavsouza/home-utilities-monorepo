import type { CurrencyCode, Money } from '@packages/contracts';
import { getCurrency } from './currency-catalog';
import {
  moneyAmountInvalidError,
  moneyCurrencyMismatchError,
  moneyMajorInvalidError,
} from './money-errors';

const MAJOR_PATTERN = /^-?\d+(\.\d+)?$/;

export function createMoney(
  amountMinor: number,
  currency: CurrencyCode,
): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw moneyAmountInvalidError();
  }
  getCurrency(currency);
  return { amountMinor, currency };
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
  const amountMinor = Number(`${negative ? '-' : ''}${digits}`);

  if (!Number.isSafeInteger(amountMinor)) {
    throw moneyAmountInvalidError();
  }

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
  const whole =
    definition.scale === 0
      ? padded
      : padded.slice(0, padded.length - definition.scale);
  const fraction =
    definition.scale === 0
      ? ''
      : padded.slice(padded.length - definition.scale);
  const major = definition.scale === 0 ? whole : `${whole}.${fraction}`;
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
    throw moneyAmountInvalidError();
  }
  return result;
}
