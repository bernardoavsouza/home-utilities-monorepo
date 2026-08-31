export type FinDomainErrorFields = Record<string, string[]>;

export type FinErrorCode =
  | 'FIN_CURRENCY_UNKNOWN'
  | 'FIN_MONEY_AMOUNT_INVALID'
  | 'FIN_MONEY_MAJOR_INVALID'
  | 'FIN_MONEY_OVERFLOW'
  | 'FIN_MONEY_CURRENCY_MISMATCH';

export class FinDomainError extends Error {
  readonly code: FinErrorCode;
  readonly fields: FinDomainErrorFields;

  constructor(
    code: FinErrorCode,
    message: string,
    fields: FinDomainErrorFields,
  ) {
    super(message);
    this.name = 'FinDomainError';
    this.code = code;
    this.fields = fields;
  }
}

export function currencyUnknownError(): FinDomainError {
  return new FinDomainError(
    'FIN_CURRENCY_UNKNOWN',
    'Currency is not in the MVP catalog',
    { currency: ['Unknown currency code'] },
  );
}

export function moneyAmountInvalidError(): FinDomainError {
  return new FinDomainError(
    'FIN_MONEY_AMOUNT_INVALID',
    'Money amountMinor must be a safe integer',
    { amountMinor: ['Must be a safe integer'] },
  );
}

export function moneyMajorInvalidError(): FinDomainError {
  return new FinDomainError(
    'FIN_MONEY_MAJOR_INVALID',
    'Money major amount string is invalid for currency scale',
    { amount: ['Invalid major amount for currency scale'] },
  );
}

export function moneyOverflowError(): FinDomainError {
  return new FinDomainError(
    'FIN_MONEY_OVERFLOW',
    'Money arithmetic result exceeds safe integer range',
    { amountMinor: ['Result exceeds safe integer range'] },
  );
}

export function moneyCurrencyMismatchError(): FinDomainError {
  return new FinDomainError(
    'FIN_MONEY_CURRENCY_MISMATCH',
    'Money arithmetic requires the same currency',
    { currency: ['Expected same currency on both operands'] },
  );
}
