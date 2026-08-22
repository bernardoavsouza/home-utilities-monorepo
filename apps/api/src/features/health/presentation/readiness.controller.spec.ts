import type { ReadinessResponse } from '@packages/contracts';
import { Module } from '@nestjs/common';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { App } from 'supertest/types';
import { ReadinessService } from '@/features/health/application/readiness.service';
import { HealthModule } from '@/features/health/health.module';
import { ReadinessController } from '@/features/health/presentation/readiness.controller';
import { createTestApp } from '@/shared/infrastructure/http/create-test-app';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

const unreachablePrisma = {
  $queryRaw: () => Promise.reject(new Error("Can't reach database server")),
} as unknown as PrismaService;

@Module({
  controllers: [ReadinessController],
  providers: [
    ReadinessService,
    { provide: PrismaService, useValue: unreachablePrisma },
  ],
})
class UnreachableDatabaseModule {}

describe('ReadinessController', () => {
  describe('unit', () => {
    it('reports the database up when the probe query succeeds', async () => {
      const service = new ReadinessService({
        $queryRaw: () => Promise.resolve([{ ok: 1 }]),
      } as unknown as PrismaService);

      await expect(service.check()).resolves.toEqual({
        status: 'ready',
        dependencies: { database: 'up' },
      });
    });

    it('reports the database down instead of throwing', async () => {
      const service = new ReadinessService(unreachablePrisma);

      await expect(service.check()).resolves.toEqual({
        status: 'not_ready',
        dependencies: { database: 'down' },
      });
    });
  });

  describe('http', () => {
    it('GET /v1/health/ready returns 200 when Postgres is up', async () => {
      const app = await createTestApp(HealthModule);
      try {
        const response = await request(app.getHttpServer() as App)
          .get('/v1/health/ready')
          .expect(200);
        expect(response.body as ReadinessResponse).toEqual({
          status: 'ready',
          dependencies: { database: 'up' },
        });
      } finally {
        await app.close();
      }
    });

    it('GET /v1/health/ready returns 503 when the database is unreachable', async () => {
      const app = await createTestApp(UnreachableDatabaseModule);
      try {
        const response = await request(app.getHttpServer() as App)
          .get('/v1/health/ready')
          .expect(503);
        expect(response.body as ReadinessResponse).toEqual({
          status: 'not_ready',
          dependencies: { database: 'down' },
        });
      } finally {
        await app.close();
      }
    });
  });
});
