import { PrismaClient } from '@prisma/client';

const MIGRATIONS_TABLE = '_prisma_migrations';

export function databaseNameFromUrl(
  databaseUrl: string | undefined,
): string | undefined {
  if (!databaseUrl) {
    return undefined;
  }

  try {
    const pathname = new URL(databaseUrl).pathname.replace(/^\//, '');
    return pathname.length > 0 ? pathname : undefined;
  } catch {
    return undefined;
  }
}

export function shouldResetTestDatabase(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.ENVIRONMENT !== 'TEST') {
    return false;
  }

  const databaseName = databaseNameFromUrl(env.DATABASE_URL);
  return databaseName !== undefined && databaseName.endsWith('_test');
}

export function buildTruncateStatement(tableNames: string[]): string | null {
  if (tableNames.length === 0) {
    return null;
  }

  const qualified = tableNames
    .map((name) => `"public"."${name.replaceAll('"', '')}"`)
    .join(', ');

  return `TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE`;
}

export async function resetTestDatabase(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!shouldResetTestDatabase(env)) {
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: env.DATABASE_URL } },
  });

  try {
    await prisma.$connect();
  } catch {
    await prisma.$disconnect().catch(() => undefined);
    return;
  }

  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> ${MIGRATIONS_TABLE}
    `;

    const statement = buildTruncateStatement(
      tables.map((row) => row.tablename),
    );
    if (statement) {
      await prisma.$executeRawUnsafe(statement);
    }
  } finally {
    await prisma.$disconnect();
  }
}
