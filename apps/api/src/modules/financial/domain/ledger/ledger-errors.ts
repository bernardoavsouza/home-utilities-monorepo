import { FinDomainError } from '@/modules/financial/domain/currency/money-errors';

export function entryUnbalancedError(): FinDomainError {
  return new FinDomainError(
    'FIN_ENTRY_UNBALANCED',
    'Journal entry debits and credits must match per currency',
    { entry: ['Debits and credits must match per currency'] },
  );
}

export function entryTooFewLinesError(): FinDomainError {
  return new FinDomainError(
    'FIN_ENTRY_TOO_FEW_LINES',
    'Journal entry requires at least 2 lines',
    { lines: ['At least 2 lines required'] },
  );
}

export function lineAmountInvalidError(): FinDomainError {
  return new FinDomainError(
    'FIN_LINE_AMOUNT_INVALID',
    'Journal line amountMinor must be a non-negative safe integer',
    { amountMinor: ['Must be a non-negative safe integer'] },
  );
}

export function accountNotFoundError(): FinDomainError {
  return new FinDomainError(
    'FIN_ACCOUNT_NOT_FOUND',
    'Account not found for user',
    { accountId: ['Account not found'] },
  );
}

export function accountTypeInvalidError(message: string): FinDomainError {
  return new FinDomainError('FIN_ACCOUNT_TYPE_INVALID', message, {
    type: [message],
  });
}

export function accountCurrencyMismatchError(): FinDomainError {
  return new FinDomainError(
    'FIN_ACCOUNT_CURRENCY_MISMATCH',
    'Money currency must match account currency',
    { currency: ['Expected money currency to match account currency'] },
  );
}

export function exchangeInvalidError(message: string): FinDomainError {
  return new FinDomainError('FIN_EXCHANGE_INVALID', message, {
    exchange: [message],
  });
}

export function entryImmutableError(): FinDomainError {
  return new FinDomainError(
    'FIN_ENTRY_IMMUTABLE',
    'Posted entries cannot be modified',
    { entryId: ['Posted entries cannot be modified'] },
  );
}

export function entryNotFoundError(): FinDomainError {
  return new FinDomainError(
    'FIN_ENTRY_NOT_FOUND',
    'Journal entry not found for user',
    { entryId: ['Entry not found'] },
  );
}
