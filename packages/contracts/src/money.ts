export type CurrencyCode = 'BRL' | 'USD' | 'EUR' | 'USDC' | 'USDT' | 'BTC';

export type CurrencyKind = 'fiat' | 'stablecoin' | 'crypto';

export type CurrencyDefinition = {
  code: CurrencyCode;
  scale: number;
  symbol: string;
  kind: CurrencyKind;
};

export type Money = {
  amountMinor: number;
  currency: CurrencyCode;
};
