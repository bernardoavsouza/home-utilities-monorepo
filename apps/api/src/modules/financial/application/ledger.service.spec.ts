import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FinDomainError } from '@/modules/financial/domain/currency/money-errors';
import { FinancialModule } from '@/modules/financial/financial.module';
import { LedgerService } from '@/modules/financial/application/ledger.service';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

describe('LedgerService', () => {
  let service: LedgerService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FinancialModule],
    }).compile();
    service = moduleRef.get(LedgerService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function userId(): string {
    return randomUUID();
  }

  it('creates asset/liability accounts and rejects other user-facing types', async () => {
    const uid = userId();
    const checking = await service.createUserAccount({
      userId: uid,
      name: 'Checking',
      type: 'asset',
      currency: 'BRL',
    });
    const card = await service.createUserAccount({
      userId: uid,
      name: 'Card',
      type: 'liability',
      currency: 'BRL',
    });
    expect(checking.type).toBe('asset');
    expect(card.type).toBe('liability');

    const listed = await service.listUserAccounts(uid);
    expect(listed.map((a) => a.name).sort()).toEqual(['Card', 'Checking']);

    await expect(
      service.createUserAccount({
        userId: uid,
        name: 'Bad',
        type: 'income' as 'asset',
        currency: 'BRL',
      }),
    ).rejects.toMatchObject({ code: 'FIN_ACCOUNT_TYPE_INVALID' });
  });

  it('posts expense from asset and decreases asset signed balance', async () => {
    const uid = userId();
    const checking = await service.createUserAccount({
      userId: uid,
      name: 'Checking',
      type: 'asset',
      currency: 'BRL',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: checking.id,
      amountMinor: 10_000,
    });
    await service.postExpense({
      userId: uid,
      fundingAccountId: checking.id,
      amountMinor: 2500,
    });
    const balance = await service.getAccountBalance(uid, checking.id);
    expect(balance.signedBalance).toBe(7500);
  });

  it('credit card purchase then pay liability zeros the liability', async () => {
    const uid = userId();
    const checking = await service.createUserAccount({
      userId: uid,
      name: 'Checking',
      type: 'asset',
      currency: 'BRL',
    });
    const card = await service.createUserAccount({
      userId: uid,
      name: 'Card',
      type: 'liability',
      currency: 'BRL',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: checking.id,
      amountMinor: 50_000,
    });
    await service.postExpense({
      userId: uid,
      fundingAccountId: card.id,
      amountMinor: 8000,
    });
    expect((await service.getAccountBalance(uid, card.id)).signedBalance).toBe(
      8000,
    );
    await service.postPayLiability({
      userId: uid,
      assetAccountId: checking.id,
      liabilityAccountId: card.id,
      amountMinor: 8000,
    });
    expect((await service.getAccountBalance(uid, card.id)).signedBalance).toBe(
      0,
    );
    expect(
      (await service.getAccountBalance(uid, checking.id)).signedBalance,
    ).toBe(42_000);
  });

  it('posts income into an asset', async () => {
    const uid = userId();
    const checking = await service.createUserAccount({
      userId: uid,
      name: 'Checking',
      type: 'asset',
      currency: 'BRL',
    });
    await service.postIncome({
      userId: uid,
      destinationAccountId: checking.id,
      amountMinor: 3000,
    });
    expect(
      (await service.getAccountBalance(uid, checking.id)).signedBalance,
    ).toBe(3000);
  });

  it('transfers same-currency between assets', async () => {
    const uid = userId();
    const a = await service.createUserAccount({
      userId: uid,
      name: 'A',
      type: 'asset',
      currency: 'BRL',
    });
    const b = await service.createUserAccount({
      userId: uid,
      name: 'B',
      type: 'asset',
      currency: 'BRL',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: a.id,
      amountMinor: 5000,
    });
    await service.postTransfer({
      userId: uid,
      fromAccountId: a.id,
      toAccountId: b.id,
      amountMinor: 2000,
    });
    expect((await service.getAccountBalance(uid, a.id)).signedBalance).toBe(
      3000,
    );
    expect((await service.getAccountBalance(uid, b.id)).signedBalance).toBe(
      2000,
    );
  });

  it('rejects cross-currency transfer', async () => {
    const uid = userId();
    const brl = await service.createUserAccount({
      userId: uid,
      name: 'BRL',
      type: 'asset',
      currency: 'BRL',
    });
    const usd = await service.createUserAccount({
      userId: uid,
      name: 'USD',
      type: 'asset',
      currency: 'USD',
    });
    await expect(
      service.postTransfer({
        userId: uid,
        fromAccountId: brl.id,
        toAccountId: usd.id,
        amountMinor: 100,
      }),
    ).rejects.toMatchObject({ code: 'FIN_ACCOUNT_CURRENCY_MISMATCH' });
  });

  it('split expense balances without category aggregation', async () => {
    const uid = userId();
    const checking = await service.createUserAccount({
      userId: uid,
      name: 'Checking',
      type: 'asset',
      currency: 'BRL',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: checking.id,
      amountMinor: 10_000,
    });
    const entry = await service.postSplitExpense({
      userId: uid,
      fundingAccountId: checking.id,
      splits: [
        { amountMinor: 1000 },
        { amountMinor: 1500 },
        { amountMinor: 500 },
      ],
    });
    expect(entry.lines).toHaveLength(4);
    expect(
      (await service.getAccountBalance(uid, checking.id)).signedBalance,
    ).toBe(7000);
  });

  it('rejects empty split expense', async () => {
    const uid = userId();
    const checking = await service.createUserAccount({
      userId: uid,
      name: 'Checking',
      type: 'asset',
      currency: 'BRL',
    });
    await expect(
      service.postSplitExpense({
        userId: uid,
        fundingAccountId: checking.id,
        splits: [],
      }),
    ).rejects.toBeInstanceOf(FinDomainError);
  });

  it('exchanges BRL to USD balancing each currency via Exchange accounts', async () => {
    const uid = userId();
    const brl = await service.createUserAccount({
      userId: uid,
      name: 'BRL Cash',
      type: 'asset',
      currency: 'BRL',
    });
    const usd = await service.createUserAccount({
      userId: uid,
      name: 'USD Cash',
      type: 'asset',
      currency: 'USD',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: brl.id,
      amountMinor: 100_000,
    });
    const entry = await service.postExchange({
      userId: uid,
      fromAccountId: brl.id,
      toAccountId: usd.id,
      fromMoney: { amountMinor: 10_000, currency: 'BRL' },
      toMoney: { amountMinor: 1800, currency: 'USD' },
    });
    expect(entry.lines).toHaveLength(4);
    expect((await service.getAccountBalance(uid, brl.id)).signedBalance).toBe(
      90_000,
    );
    expect((await service.getAccountBalance(uid, usd.id)).signedBalance).toBe(
      1800,
    );
  });

  it('exchanges with BRL fee and stays balanced per currency', async () => {
    const uid = userId();
    const brl = await service.createUserAccount({
      userId: uid,
      name: 'BRL Cash',
      type: 'asset',
      currency: 'BRL',
    });
    const usd = await service.createUserAccount({
      userId: uid,
      name: 'USD Cash',
      type: 'asset',
      currency: 'USD',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: brl.id,
      amountMinor: 100_000,
    });
    const entry = await service.postExchange({
      userId: uid,
      fromAccountId: brl.id,
      toAccountId: usd.id,
      fromMoney: { amountMinor: 10_000, currency: 'BRL' },
      toMoney: { amountMinor: 1800, currency: 'USD' },
      fee: { amountMinor: 250, currency: 'BRL' },
    });
    expect(entry.lines).toHaveLength(6);
    expect((await service.getAccountBalance(uid, brl.id)).signedBalance).toBe(
      89_750,
    );
    expect((await service.getAccountBalance(uid, usd.id)).signedBalance).toBe(
      1800,
    );
  });

  it('rejects invalid exchange shapes', async () => {
    const uid = userId();
    const brl = await service.createUserAccount({
      userId: uid,
      name: 'BRL',
      type: 'asset',
      currency: 'BRL',
    });
    const brl2 = await service.createUserAccount({
      userId: uid,
      name: 'BRL2',
      type: 'asset',
      currency: 'BRL',
    });
    const usd = await service.createUserAccount({
      userId: uid,
      name: 'USD',
      type: 'asset',
      currency: 'USD',
    });
    await expect(
      service.postExchange({
        userId: uid,
        fromAccountId: brl.id,
        toAccountId: brl2.id,
        fromMoney: { amountMinor: 100, currency: 'BRL' },
        toMoney: { amountMinor: 100, currency: 'BRL' },
      }),
    ).rejects.toMatchObject({ code: 'FIN_EXCHANGE_INVALID' });
    await expect(
      service.postExchange({
        userId: uid,
        fromAccountId: brl.id,
        toAccountId: usd.id,
        fromMoney: { amountMinor: 100, currency: 'BRL' },
        toMoney: { amountMinor: 20, currency: 'USD' },
        fee: { amountMinor: 5, currency: 'USD' },
      }),
    ).rejects.toMatchObject({ code: 'FIN_EXCHANGE_INVALID' });
  });

  it('opening balance works for asset and liability', async () => {
    const uid = userId();
    const asset = await service.createUserAccount({
      userId: uid,
      name: 'Cash',
      type: 'asset',
      currency: 'BRL',
    });
    const liability = await service.createUserAccount({
      userId: uid,
      name: 'Card',
      type: 'liability',
      currency: 'BRL',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: asset.id,
      amountMinor: 1000,
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: liability.id,
      amountMinor: 400,
    });
    expect((await service.getAccountBalance(uid, asset.id)).signedBalance).toBe(
      1000,
    );
    expect(
      (await service.getAccountBalance(uid, liability.id)).signedBalance,
    ).toBe(400);
  });

  it('reverseEntry restores balances', async () => {
    const uid = userId();
    const checking = await service.createUserAccount({
      userId: uid,
      name: 'Checking',
      type: 'asset',
      currency: 'BRL',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: checking.id,
      amountMinor: 5000,
    });
    const expense = await service.postExpense({
      userId: uid,
      fundingAccountId: checking.id,
      amountMinor: 1500,
    });
    expect(
      (await service.getAccountBalance(uid, checking.id)).signedBalance,
    ).toBe(3500);
    await service.reverseEntry({ userId: uid, entryId: expense.id });
    expect(
      (await service.getAccountBalance(uid, checking.id)).signedBalance,
    ).toBe(5000);
  });

  it('postEntry rejects unbalanced, too few lines, negative amounts, cross-user', async () => {
    const uid = userId();
    const other = userId();
    const checking = await service.createUserAccount({
      userId: uid,
      name: 'Checking',
      type: 'asset',
      currency: 'BRL',
    });
    await service.ensureSystemAccounts(uid, 'BRL');
    const systemExpense = await prisma.finAccount.findFirstOrThrow({
      where: { userId: uid, systemKind: 'Expense', currency: 'BRL' },
    });

    await expect(
      service.postEntry({
        userId: uid,
        kind: 'expense',
        lines: [
          { accountId: systemExpense.id, side: 'debit', amountMinor: 100 },
          { accountId: checking.id, side: 'credit', amountMinor: 50 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FIN_ENTRY_UNBALANCED' });

    await expect(
      service.postEntry({
        userId: uid,
        kind: 'expense',
        lines: [{ accountId: checking.id, side: 'debit', amountMinor: 10 }],
      }),
    ).rejects.toMatchObject({ code: 'FIN_ENTRY_TOO_FEW_LINES' });

    await expect(
      service.postEntry({
        userId: uid,
        kind: 'expense',
        lines: [
          { accountId: systemExpense.id, side: 'debit', amountMinor: -1 },
          { accountId: checking.id, side: 'credit', amountMinor: -1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FIN_LINE_AMOUNT_INVALID' });

    await expect(
      service.postExpense({
        userId: other,
        fundingAccountId: checking.id,
        amountMinor: 10,
      }),
    ).rejects.toMatchObject({ code: 'FIN_ACCOUNT_NOT_FOUND' });

    await expect(
      service.createUserAccount({
        userId: uid,
        name: 'X',
        type: 'asset',
        currency: 'XXX',
      }),
    ).rejects.toMatchObject({ code: 'FIN_CURRENCY_UNKNOWN' });
  });

  it('ensureSystemAccounts is idempotent', async () => {
    const uid = userId();
    const first = await service.ensureSystemAccounts(uid, 'USD');
    const second = await service.ensureSystemAccounts(uid, 'USD');
    expect(first).toHaveLength(4);
    expect(second.map((a) => a.id).sort()).toEqual(
      first.map((a) => a.id).sort(),
    );
    const count = await prisma.finAccount.count({
      where: { userId: uid, isSystem: true, currency: 'USD' },
    });
    expect(count).toBe(4);
  });

  it('validates a fee even when it posts no lines', async () => {
    const uid = userId();
    const brl = await service.createUserAccount({
      userId: uid,
      name: 'BRL',
      type: 'asset',
      currency: 'BRL',
    });
    const usd = await service.createUserAccount({
      userId: uid,
      name: 'USD',
      type: 'asset',
      currency: 'USD',
    });
    const exchange = {
      userId: uid,
      fromAccountId: brl.id,
      toAccountId: usd.id,
      fromMoney: { amountMinor: 10_000, currency: 'BRL' } as const,
      toMoney: { amountMinor: 1800, currency: 'USD' } as const,
    };

    await expect(
      service.postExchange({
        ...exchange,
        fee: { amountMinor: 0, currency: 'USD' },
      }),
    ).rejects.toMatchObject({ code: 'FIN_EXCHANGE_INVALID' });
    await expect(
      service.postExchange({
        ...exchange,
        fee: { amountMinor: -500, currency: 'BRL' },
      }),
    ).rejects.toMatchObject({ code: 'FIN_LINE_AMOUNT_INVALID' });

    const zeroFee = await service.postExchange({
      ...exchange,
      fee: { amountMinor: 0, currency: 'BRL' },
    });
    expect(zeroFee.lines).toHaveLength(4);
  });

  it('rejects reversing the same entry twice', async () => {
    const uid = userId();
    const cash = await service.createUserAccount({
      userId: uid,
      name: 'Cash',
      type: 'asset',
      currency: 'BRL',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: cash.id,
      amountMinor: 10_000,
    });
    const expense = await service.postExpense({
      userId: uid,
      fundingAccountId: cash.id,
      amountMinor: 2500,
    });

    await service.reverseEntry({ userId: uid, entryId: expense.id });
    await expect(
      service.reverseEntry({ userId: uid, entryId: expense.id }),
    ).rejects.toMatchObject({ code: 'FIN_ENTRY_IMMUTABLE' });
    expect((await service.getAccountBalance(uid, cash.id)).signedBalance).toBe(
      10_000,
    );
  });

  it('rejects a transfer to the same account', async () => {
    const uid = userId();
    const cash = await service.createUserAccount({
      userId: uid,
      name: 'Cash',
      type: 'asset',
      currency: 'BRL',
    });
    await expect(
      service.postTransfer({
        userId: uid,
        fromAccountId: cash.id,
        toAccountId: cash.id,
        amountMinor: 500,
      }),
    ).rejects.toMatchObject({ code: 'FIN_ACCOUNT_TYPE_INVALID' });
    expect(await service.getAccountLedger(uid, cash.id)).toHaveLength(0);
  });

  it('rejects postEntry reversing an entry from another user', async () => {
    const owner = userId();
    const other = userId();
    const ownerCash = await service.createUserAccount({
      userId: owner,
      name: 'Cash',
      type: 'asset',
      currency: 'BRL',
    });
    const otherCash = await service.createUserAccount({
      userId: other,
      name: 'Cash',
      type: 'asset',
      currency: 'BRL',
    });
    const ownerEntry = await service.postOpeningBalance({
      userId: owner,
      accountId: ownerCash.id,
      amountMinor: 1000,
    });
    await expect(
      service.postEntry({
        userId: other,
        kind: 'reversal',
        reversesEntryId: ownerEntry.id,
        lines: [
          { accountId: otherCash.id, side: 'debit', amountMinor: 100 },
          { accountId: otherCash.id, side: 'credit', amountMinor: 100 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FIN_ENTRY_NOT_FOUND' });
  });

  it('filters the account ledger by date range', async () => {
    const uid = userId();
    const cash = await service.createUserAccount({
      userId: uid,
      name: 'Cash',
      type: 'asset',
      currency: 'BRL',
    });
    await service.postOpeningBalance({
      userId: uid,
      accountId: cash.id,
      amountMinor: 5000,
      postedAt: new Date('2026-01-10T00:00:00Z'),
    });
    await service.postExpense({
      userId: uid,
      fundingAccountId: cash.id,
      amountMinor: 1000,
      postedAt: new Date('2026-03-10T00:00:00Z'),
    });

    expect(await service.getAccountLedger(uid, cash.id)).toHaveLength(2);
    const firstQuarter = await service.getAccountLedger(uid, cash.id, {
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-02-01T00:00:00Z'),
    });
    expect(firstQuarter).toHaveLength(1);
    expect(firstQuarter[0]?.postedAt).toEqual(new Date('2026-01-10T00:00:00Z'));
  });

  it('hides system accounts from listUserAccounts', async () => {
    const uid = userId();
    await service.createUserAccount({
      userId: uid,
      name: 'Cash',
      type: 'asset',
      currency: 'BRL',
    });
    await service.ensureSystemAccounts(uid, 'BRL');
    const listed = await service.listUserAccounts(uid);
    expect(listed.every((a) => !a.isSystem)).toBe(true);
    expect(listed).toHaveLength(1);
  });
});
