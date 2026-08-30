import type { CurrencyCode, Money } from '@packages/contracts';

const asCurrency = (code: CurrencyCode): CurrencyCode => code;

const money = (amountMinor: number, code: CurrencyCode = 'BRL'): Money => ({
  amountMinor,
  currency: asCurrency(code),
});

export const exampleMoney = money(1050);
