import path from 'node:path';
import { config } from 'dotenv';
import { beforeAll } from 'vitest';
import { resetTestDatabase } from './src/shared/infrastructure/prisma/reset-test-database';

config({ path: path.resolve(__dirname, '.env.test') });

beforeAll(async () => {
  await resetTestDatabase();
});
