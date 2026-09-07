import { Injectable } from '@nestjs/common';
import type {
  FinAccount,
  FinJournalEntry,
  FinJournalLine,
  FinAccountType,
  FinJournalSide,
  FinSystemAccountKind,
} from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { lineAmountInvalidError } from '@/modules/financial/domain/ledger/ledger-errors';
import type {
  FinAccountTypeName,
  FinEntryKind,
  FinJournalSideName,
  FinSystemAccountKindName,
  PostLineDraft,
} from '@/modules/financial/domain/ledger/types';

const ACCOUNT_TYPE_TO_PRISMA: Record<FinAccountTypeName, FinAccountType> = {
  asset: 'Asset',
  liability: 'Liability',
  income: 'Income',
  expense: 'Expense',
  equity: 'Equity',
};

const ACCOUNT_TYPE_FROM_PRISMA: Record<FinAccountType, FinAccountTypeName> = {
  Asset: 'asset',
  Liability: 'liability',
  Income: 'income',
  Expense: 'expense',
  Equity: 'equity',
};

const SIDE_TO_PRISMA: Record<FinJournalSideName, FinJournalSide> = {
  debit: 'Debit',
  credit: 'Credit',
};

const SIDE_FROM_PRISMA: Record<FinJournalSide, FinJournalSideName> = {
  Debit: 'debit',
  Credit: 'credit',
};

const SYSTEM_KIND_TO_PRISMA: Record<
  FinSystemAccountKindName,
  FinSystemAccountKind
> = {
  income: 'Income',
  expense: 'Expense',
  exchange: 'Exchange',
  opening_balance: 'OpeningBalance',
};

const SYSTEM_KIND_FROM_PRISMA: Record<
  FinSystemAccountKind,
  FinSystemAccountKindName
> = {
  Income: 'income',
  Expense: 'expense',
  Exchange: 'exchange',
  OpeningBalance: 'opening_balance',
};

export type LedgerAccountRecord = {
  id: string;
  userId: string;
  name: string;
  type: FinAccountTypeName;
  currency: string;
  isSystem: boolean;
  systemKind: FinSystemAccountKindName | null;
};

export type LedgerEntryRecord = {
  id: string;
  userId: string;
  postedAt: Date;
  description: string | null;
  kind: string;
  reversesEntryId: string | null;
  lines: Array<{
    id: string;
    accountId: string;
    side: FinJournalSideName;
    amountMinor: number;
  }>;
};

function toNumberAmount(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw lineAmountInvalidError();
  }
  return Number(value);
}

function mapAccount(account: FinAccount): LedgerAccountRecord {
  return {
    id: account.id,
    userId: account.userId,
    name: account.name,
    type: ACCOUNT_TYPE_FROM_PRISMA[account.type],
    currency: account.currency,
    isSystem: account.isSystem,
    systemKind: account.systemKind
      ? SYSTEM_KIND_FROM_PRISMA[account.systemKind]
      : null,
  };
}

@Injectable()
export class LedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAccount(input: {
    userId: string;
    name: string;
    type: FinAccountTypeName;
    currency: string;
    isSystem?: boolean;
    systemKind?: FinSystemAccountKindName | null;
  }): Promise<LedgerAccountRecord> {
    const account = await this.prisma.finAccount.create({
      data: {
        userId: input.userId,
        name: input.name,
        type: ACCOUNT_TYPE_TO_PRISMA[input.type],
        currency: input.currency,
        isSystem: input.isSystem ?? false,
        systemKind:
          input.systemKind != null
            ? SYSTEM_KIND_TO_PRISMA[input.systemKind]
            : null,
      },
    });
    return mapAccount(account);
  }

  async findAccountForUser(
    userId: string,
    accountId: string,
  ): Promise<LedgerAccountRecord | null> {
    const account = await this.prisma.finAccount.findFirst({
      where: { id: accountId, userId },
    });
    return account ? mapAccount(account) : null;
  }

  async listUserFacingAccounts(userId: string): Promise<LedgerAccountRecord[]> {
    const accounts = await this.prisma.finAccount.findMany({
      where: {
        userId,
        isSystem: false,
        type: { in: ['Asset', 'Liability'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(mapAccount);
  }

  async findSystemAccount(
    userId: string,
    systemKind: FinSystemAccountKindName,
    currency: string,
  ): Promise<LedgerAccountRecord | null> {
    const account = await this.prisma.finAccount.findFirst({
      where: {
        userId,
        systemKind: SYSTEM_KIND_TO_PRISMA[systemKind],
        currency,
        isSystem: true,
      },
    });
    return account ? mapAccount(account) : null;
  }

  async createSystemAccount(input: {
    userId: string;
    name: string;
    type: FinAccountTypeName;
    currency: string;
    systemKind: FinSystemAccountKindName;
  }): Promise<LedgerAccountRecord> {
    try {
      return await this.createAccount({
        ...input,
        isSystem: true,
        systemKind: input.systemKind,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const existing = await this.findSystemAccount(
          input.userId,
          input.systemKind,
          input.currency,
        );
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async insertEntryWithLines(input: {
    userId: string;
    kind: FinEntryKind;
    description?: string | null;
    postedAt: Date;
    reversesEntryId?: string | null;
    lines: PostLineDraft[];
  }): Promise<LedgerEntryRecord> {
    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.finJournalEntry.create({
        data: {
          userId: input.userId,
          kind: input.kind,
          description: input.description ?? null,
          postedAt: input.postedAt,
          reversesEntryId: input.reversesEntryId ?? null,
          lines: {
            create: input.lines.map((line) => ({
              accountId: line.accountId,
              side: SIDE_TO_PRISMA[line.side],
              amountMinor: BigInt(line.amountMinor),
            })),
          },
        },
        include: { lines: true },
      });
      return entry;
    });

    return this.mapEntry(created);
  }

  async findEntryForUser(
    userId: string,
    entryId: string,
  ): Promise<LedgerEntryRecord | null> {
    const entry = await this.prisma.finJournalEntry.findFirst({
      where: { id: entryId, userId },
      include: { lines: true },
    });
    return entry ? this.mapEntry(entry) : null;
  }

  async sumLinesForAccount(
    accountId: string,
  ): Promise<{ debit: number; credit: number }> {
    const groups = await this.prisma.finJournalLine.groupBy({
      by: ['side'],
      where: { accountId },
      _sum: { amountMinor: true },
    });

    let debit = 0;
    let credit = 0;
    for (const group of groups) {
      const total = toNumberAmount(group._sum.amountMinor ?? 0n);
      if (group.side === 'Debit') {
        debit = total;
      } else {
        credit = total;
      }
    }
    return { debit, credit };
  }

  async listLinesForAccount(accountId: string): Promise<
    Array<{
      id: string;
      entryId: string;
      side: FinJournalSideName;
      amountMinor: number;
      postedAt: Date;
      kind: string;
      description: string | null;
    }>
  > {
    const lines = await this.prisma.finJournalLine.findMany({
      where: { accountId },
      include: { entry: true },
      orderBy: [{ entry: { postedAt: 'asc' } }, { id: 'asc' }],
    });

    return lines.map((line) => ({
      id: line.id,
      entryId: line.entryId,
      side: SIDE_FROM_PRISMA[line.side],
      amountMinor: toNumberAmount(line.amountMinor),
      postedAt: line.entry.postedAt,
      kind: line.entry.kind,
      description: line.entry.description,
    }));
  }

  private mapEntry(
    entry: FinJournalEntry & { lines: FinJournalLine[] },
  ): LedgerEntryRecord {
    return {
      id: entry.id,
      userId: entry.userId,
      postedAt: entry.postedAt,
      description: entry.description,
      kind: entry.kind,
      reversesEntryId: entry.reversesEntryId,
      lines: entry.lines.map((line) => ({
        id: line.id,
        accountId: line.accountId,
        side: SIDE_FROM_PRISMA[line.side],
        amountMinor: toNumberAmount(line.amountMinor),
      })),
    };
  }
}
