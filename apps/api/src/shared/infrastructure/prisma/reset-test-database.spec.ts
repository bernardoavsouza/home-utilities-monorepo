import {
  buildTruncateStatement,
  databaseNameFromUrl,
  shouldResetTestDatabase,
} from '@/shared/infrastructure/prisma/reset-test-database';

describe('shouldResetTestDatabase', () => {
  it('resets only when ENVIRONMENT is TEST and the database name ends with _test', () => {
    expect(
      shouldResetTestDatabase({
        ENVIRONMENT: 'TEST',
        DATABASE_URL:
          'postgresql://app:app@localhost:5432/app_test?schema=public',
      }),
    ).toBe(true);
  });

  it('does not reset without ENVIRONMENT=TEST', () => {
    expect(
      shouldResetTestDatabase({
        DATABASE_URL:
          'postgresql://app:app@localhost:5432/app_test?schema=public',
      }),
    ).toBe(false);
  });

  it('does not reset a non-test database name even with ENVIRONMENT=TEST', () => {
    expect(
      shouldResetTestDatabase({
        ENVIRONMENT: 'TEST',
        DATABASE_URL: 'postgresql://app:app@localhost:5432/app?schema=public',
      }),
    ).toBe(false);
  });
});

describe('databaseNameFromUrl', () => {
  it('reads the database name from a postgres URL', () => {
    expect(
      databaseNameFromUrl(
        'postgresql://app:app@localhost:5432/app_test?schema=public',
      ),
    ).toBe('app_test');
  });
});

describe('buildTruncateStatement', () => {
  it('returns null when there are no tables', () => {
    expect(buildTruncateStatement([])).toBeNull();
  });

  it('truncates listed tables with identity restart and cascade', () => {
    expect(buildTruncateStatement(['order', 'order_item'])).toBe(
      'TRUNCATE TABLE "public"."order", "public"."order_item" RESTART IDENTITY CASCADE',
    );
  });
});
