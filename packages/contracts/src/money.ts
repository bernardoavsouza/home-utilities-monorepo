export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' };

export type Money = {
  amount: string;
  currency: CurrencyCode;
};
