export type CurrencyCode =
  | 'BRL'
  | 'USD'
  | 'EUR'
  | 'USDC'
  | 'USDT'
  | 'BTC'
  | 'DEPIX';

export type CurrencyKind = 'fiat' | 'stablecoin' | 'crypto';

export type CurrencyScale = 2 | 6 | 8;

export type CurrencyDefinition = {
  readonly code: CurrencyCode;
  readonly scale: CurrencyScale;
  readonly symbol: string;
  readonly kind: CurrencyKind;
};

export type Money = {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
};
