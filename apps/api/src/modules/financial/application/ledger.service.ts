import { Injectable } from '@nestjs/common';
import type { CurrencyCode, Money } from '@packages/contracts';
import { assertCurrency } from '@/modules/financial/domain/currency/currency-catalog';
import {
  assertEntryBalanced,
  assertNonNegativeAmountMinor,
  computeSignedBalance,
} from '@/modules/financial/domain/ledger/balance';
import {
  accountCurrencyMismatchError,
  accountNotFoundError,
  accountTypeInvalidError,
  entryNotFoundError,
  exchangeInvalidError,
  lineAmountInvalidError,
} from '@/modules/financial/domain/ledger/ledger-errors';
import type {
  FinAccountTypeName,
  FinEntryKind,
  FinJournalSideName,
  FinSystemAccountKindName,
  PostLineDraft,
} from '@/modules/financial/domain/ledger/types';
import {
  LedgerRepository,
  type LedgerAccountRecord,
  type LedgerEntryRecord,
} from '@/modules/financial/infrastructure/ledger.repository';

const SYSTEM_ACCOUNT_DEFS: ReadonlyArray<{
  systemKind: FinSystemAccountKindName;
  type: FinAccountTypeName;
  label: string;
}> = [
  { systemKind: 'income', type: 'income', label: 'Income' },
  { systemKind: 'expense', type: 'expense', label: 'Expense' },
  { systemKind: 'exchange', type: 'equity', label: 'Exchange' },
  {
    systemKind: 'opening_balance',
    type: 'equity',
    label: 'Opening balance',
  },
];

export type PostEntryInput = {
  userId: string;
  kind: FinEntryKind;
  description?: string;
  postedAt?: Date;
  reversesEntryId?: string;
  lines: PostLineDraft[];
};

export type PostExchangeInput = {
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  fromMoney: Money;
  toMoney: Money;
  fee?: Money;
  description?: string;
  postedAt?: Date;
};

@Injectable()
export class LedgerService {
  constructor(private readonly repository: LedgerRepository) {}

  async createUserAccount(input: {
    userId: string;
    name: string;
    type: 'asset' | 'liability';
    currency: string;
  }): Promise<LedgerAccountRecord> {
    assertCurrency(input.currency);
    if (input.type !== 'asset' && input.type !== 'liability') {
      throw accountTypeInvalidError(
        'User-facing accounts must be asset or liability',
      );
    }
    return this.repository.createAccount({
      userId: input.userId,
      name: input.name,
      type: input.type,
      currency: input.currency,
      isSystem: false,
      systemKind: null,
    });
  }

  async listUserAccounts(userId: string): Promise<LedgerAccountRecord[]> {
    return this.repository.listUserFacingAccounts(userId);
  }

  async ensureSystemAccounts(
    userId: string,
    currency: string,
  ): Promise<LedgerAccountRecord[]> {
    assertCurrency(currency);
    const ensured: LedgerAccountRecord[] = [];
    for (const def of SYSTEM_ACCOUNT_DEFS) {
      const existing = await this.repository.findSystemAccount(
        userId,
        def.systemKind,
        currency,
      );
      if (existing) {
        ensured.push(existing);
        continue;
      }
      ensured.push(
        await this.repository.createSystemAccount({
          userId,
          name: `${def.label} ${currency}`,
          type: def.type,
          currency,
          systemKind: def.systemKind,
        }),
      );
    }
    return ensured;
  }

  async postEntry(input: PostEntryInput): Promise<LedgerEntryRecord> {
    if (input.lines.length < 2) {
      assertEntryBalanced([]);
    }

    const balanceLines: Array<{
      side: FinJournalSideName;
      amountMinor: number;
      currency: CurrencyCode;
    }> = [];

    for (const line of input.lines) {
      assertNonNegativeAmountMinor(line.amountMinor);
      const account = await this.requireAccount(input.userId, line.accountId);
      assertCurrency(account.currency);
      balanceLines.push({
        side: line.side,
        amountMinor: line.amountMinor,
        currency: account.currency,
      });
    }

    assertEntryBalanced(balanceLines);

    return this.repository.insertEntryWithLines({
      userId: input.userId,
      kind: input.kind,
      description: input.description,
      postedAt: input.postedAt ?? new Date(),
      reversesEntryId: input.reversesEntryId,
      lines: input.lines,
    });
  }

  async postExpense(input: {
    userId: string;
    fundingAccountId: string;
    amountMinor: number;
    description?: string;
    postedAt?: Date;
  }): Promise<LedgerEntryRecord> {
    this.requirePositiveAmount(input.amountMinor);
    const funding = await this.requireUserFundingAccount(
      input.userId,
      input.fundingAccountId,
    );
    const expense = await this.requireSystem(
      input.userId,
      'expense',
      funding.currency,
    );
    return this.postEntry({
      userId: input.userId,
      kind: 'expense',
      description: input.description,
      postedAt: input.postedAt,
      lines: [
        {
          accountId: expense.id,
          side: 'debit',
          amountMinor: input.amountMinor,
        },
        {
          accountId: funding.id,
          side: 'credit',
          amountMinor: input.amountMinor,
        },
      ],
    });
  }

  async postIncome(input: {
    userId: string;
    destinationAccountId: string;
    amountMinor: number;
    description?: string;
    postedAt?: Date;
  }): Promise<LedgerEntryRecord> {
    this.requirePositiveAmount(input.amountMinor);
    const destination = await this.requireAccount(
      input.userId,
      input.destinationAccountId,
    );
    if (destination.type !== 'asset' || destination.isSystem) {
      throw accountTypeInvalidError('Income destination must be a user asset');
    }
    const income = await this.requireSystem(
      input.userId,
      'income',
      destination.currency,
    );
    return this.postEntry({
      userId: input.userId,
      kind: 'income',
      description: input.description,
      postedAt: input.postedAt,
      lines: [
        {
          accountId: destination.id,
          side: 'debit',
          amountMinor: input.amountMinor,
        },
        {
          accountId: income.id,
          side: 'credit',
          amountMinor: input.amountMinor,
        },
      ],
    });
  }

  async postTransfer(input: {
    userId: string;
    fromAccountId: string;
    toAccountId: string;
    amountMinor: number;
    description?: string;
    postedAt?: Date;
  }): Promise<LedgerEntryRecord> {
    this.requirePositiveAmount(input.amountMinor);
    const from = await this.requireUserFundingAccount(
      input.userId,
      input.fromAccountId,
    );
    const to = await this.requireUserFundingAccount(
      input.userId,
      input.toAccountId,
    );
    if (from.currency !== to.currency) {
      throw accountCurrencyMismatchError();
    }
    return this.postEntry({
      userId: input.userId,
      kind: 'transfer',
      description: input.description,
      postedAt: input.postedAt,
      lines: [
        { accountId: to.id, side: 'debit', amountMinor: input.amountMinor },
        { accountId: from.id, side: 'credit', amountMinor: input.amountMinor },
      ],
    });
  }

  async postPayLiability(input: {
    userId: string;
    assetAccountId: string;
    liabilityAccountId: string;
    amountMinor: number;
    description?: string;
    postedAt?: Date;
  }): Promise<LedgerEntryRecord> {
    this.requirePositiveAmount(input.amountMinor);
    const asset = await this.requireAccount(input.userId, input.assetAccountId);
    const liability = await this.requireAccount(
      input.userId,
      input.liabilityAccountId,
    );
    if (asset.type !== 'asset' || asset.isSystem) {
      throw accountTypeInvalidError(
        'Pay liability funding must be a user asset',
      );
    }
    if (liability.type !== 'liability' || liability.isSystem) {
      throw accountTypeInvalidError(
        'Pay liability target must be a user liability',
      );
    }
    if (asset.currency !== liability.currency) {
      throw accountCurrencyMismatchError();
    }
    return this.postEntry({
      userId: input.userId,
      kind: 'pay_liability',
      description: input.description,
      postedAt: input.postedAt,
      lines: [
        {
          accountId: liability.id,
          side: 'debit',
          amountMinor: input.amountMinor,
        },
        {
          accountId: asset.id,
          side: 'credit',
          amountMinor: input.amountMinor,
        },
      ],
    });
  }

  async postSplitExpense(input: {
    userId: string;
    fundingAccountId: string;
    splits: Array<{ amountMinor: number }>;
    description?: string;
    postedAt?: Date;
  }): Promise<LedgerEntryRecord> {
    if (input.splits.length < 1) {
      throw lineAmountInvalidError();
    }
    const funding = await this.requireUserFundingAccount(
      input.userId,
      input.fundingAccountId,
    );
    const expense = await this.requireSystem(
      input.userId,
      'expense',
      funding.currency,
    );
    let total = 0;
    const expenseLines: PostLineDraft[] = [];
    for (const split of input.splits) {
      this.requirePositiveAmount(split.amountMinor);
      total += split.amountMinor;
      if (!Number.isSafeInteger(total)) {
        throw lineAmountInvalidError();
      }
      expenseLines.push({
        accountId: expense.id,
        side: 'debit',
        amountMinor: split.amountMinor,
      });
    }
    return this.postEntry({
      userId: input.userId,
      kind: 'split',
      description: input.description,
      postedAt: input.postedAt,
      lines: [
        ...expenseLines,
        {
          accountId: funding.id,
          side: 'credit',
          amountMinor: total,
        },
      ],
    });
  }

  async postExchange(input: PostExchangeInput): Promise<LedgerEntryRecord> {
    const from = await this.requireUserFundingAccount(
      input.userId,
      input.fromAccountId,
    );
    const to = await this.requireUserFundingAccount(
      input.userId,
      input.toAccountId,
    );

    if (from.currency === to.currency) {
      throw exchangeInvalidError('Exchange requires different currencies');
    }
    if (input.fromMoney.currency !== from.currency) {
      throw accountCurrencyMismatchError();
    }
    if (input.toMoney.currency !== to.currency) {
      throw accountCurrencyMismatchError();
    }
    this.requirePositiveAmount(input.fromMoney.amountMinor);
    this.requirePositiveAmount(input.toMoney.amountMinor);

    const exchangeFrom = await this.requireSystem(
      input.userId,
      'exchange',
      from.currency,
    );
    const exchangeTo = await this.requireSystem(
      input.userId,
      'exchange',
      to.currency,
    );

    const lines: PostLineDraft[] = [
      {
        accountId: from.id,
        side: 'credit',
        amountMinor: input.fromMoney.amountMinor,
      },
      {
        accountId: exchangeFrom.id,
        side: 'debit',
        amountMinor: input.fromMoney.amountMinor,
      },
      {
        accountId: to.id,
        side: 'debit',
        amountMinor: input.toMoney.amountMinor,
      },
      {
        accountId: exchangeTo.id,
        side: 'credit',
        amountMinor: input.toMoney.amountMinor,
      },
    ];

    if (input.fee != null && input.fee.amountMinor > 0) {
      if (input.fee.currency !== input.fromMoney.currency) {
        throw exchangeInvalidError(
          'Fee currency must match fromMoney currency',
        );
      }
      assertNonNegativeAmountMinor(input.fee.amountMinor);
      const expense = await this.requireSystem(
        input.userId,
        'expense',
        from.currency,
      );
      lines.push(
        {
          accountId: expense.id,
          side: 'debit',
          amountMinor: input.fee.amountMinor,
        },
        {
          accountId: from.id,
          side: 'credit',
          amountMinor: input.fee.amountMinor,
        },
      );
    }

    return this.postEntry({
      userId: input.userId,
      kind: 'exchange',
      description: input.description,
      postedAt: input.postedAt,
      lines,
    });
  }

  async postOpeningBalance(input: {
    userId: string;
    accountId: string;
    amountMinor: number;
    description?: string;
    postedAt?: Date;
  }): Promise<LedgerEntryRecord> {
    this.requirePositiveAmount(input.amountMinor);
    const account = await this.requireUserFundingAccount(
      input.userId,
      input.accountId,
    );
    const opening = await this.requireSystem(
      input.userId,
      'opening_balance',
      account.currency,
    );

    const lines: PostLineDraft[] =
      account.type === 'asset'
        ? [
            {
              accountId: account.id,
              side: 'debit',
              amountMinor: input.amountMinor,
            },
            {
              accountId: opening.id,
              side: 'credit',
              amountMinor: input.amountMinor,
            },
          ]
        : [
            {
              accountId: opening.id,
              side: 'debit',
              amountMinor: input.amountMinor,
            },
            {
              accountId: account.id,
              side: 'credit',
              amountMinor: input.amountMinor,
            },
          ];

    return this.postEntry({
      userId: input.userId,
      kind: 'opening_balance',
      description: input.description,
      postedAt: input.postedAt,
      lines,
    });
  }

  async reverseEntry(input: {
    userId: string;
    entryId: string;
    description?: string;
    postedAt?: Date;
  }): Promise<LedgerEntryRecord> {
    const original = await this.repository.findEntryForUser(
      input.userId,
      input.entryId,
    );
    if (!original) {
      throw entryNotFoundError();
    }

    const lines: PostLineDraft[] = original.lines.map((line) => ({
      accountId: line.accountId,
      side: line.side === 'debit' ? 'credit' : 'debit',
      amountMinor: line.amountMinor,
    }));

    return this.postEntry({
      userId: input.userId,
      kind: 'reversal',
      description: input.description ?? `Reversal of ${original.id}`,
      postedAt: input.postedAt,
      reversesEntryId: original.id,
      lines,
    });
  }

  async getAccountBalance(
    userId: string,
    accountId: string,
  ): Promise<{ accountId: string; currency: string; signedBalance: number }> {
    const account = await this.requireAccount(userId, accountId);
    const totals = await this.repository.sumLinesForAccount(accountId);
    return {
      accountId: account.id,
      currency: account.currency,
      signedBalance: computeSignedBalance(
        account.type,
        totals.debit,
        totals.credit,
      ),
    };
  }

  async getAccountLedger(userId: string, accountId: string) {
    await this.requireAccount(userId, accountId);
    return this.repository.listLinesForAccount(accountId);
  }

  private requirePositiveAmount(amountMinor: number): void {
    assertNonNegativeAmountMinor(amountMinor);
    if (amountMinor <= 0) {
      throw lineAmountInvalidError();
    }
  }

  private async requireAccount(
    userId: string,
    accountId: string,
  ): Promise<LedgerAccountRecord> {
    const account = await this.repository.findAccountForUser(userId, accountId);
    if (!account) {
      throw accountNotFoundError();
    }
    return account;
  }

  private async requireUserFundingAccount(
    userId: string,
    accountId: string,
  ): Promise<LedgerAccountRecord> {
    const account = await this.requireAccount(userId, accountId);
    if (
      account.isSystem ||
      (account.type !== 'asset' && account.type !== 'liability')
    ) {
      throw accountTypeInvalidError(
        'Funding account must be a user-facing asset or liability',
      );
    }
    return account;
  }

  private async requireSystem(
    userId: string,
    systemKind: FinSystemAccountKindName,
    currency: string,
  ): Promise<LedgerAccountRecord> {
    await this.ensureSystemAccounts(userId, currency);
    const account = await this.repository.findSystemAccount(
      userId,
      systemKind,
      currency,
    );
    if (!account) {
      throw accountNotFoundError();
    }
    return account;
  }
}
