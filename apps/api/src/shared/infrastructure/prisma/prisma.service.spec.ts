import path from 'node:path';
import { config } from 'dotenv';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '@/shared/infrastructure/prisma/prisma.module';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

config({ path: path.resolve(__dirname, '../../../../.env.test') });

describe('PrismaService', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to postgres from compose', async () => {
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`
      SELECT 1::int AS ok
    `;
    expect(rows[0]?.ok).toBe(1);
  });
});
